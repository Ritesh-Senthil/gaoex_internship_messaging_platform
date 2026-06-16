/**
 * Conversation (Direct Message) Routes
 * Handles 1:1 and group DM conversations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { sendPushToUsers, buildDMNotification } from '../services/pushNotification';
import { buildDirectMessageKey } from '../utils/directMessage';
import { messageRateLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';

const router = Router();

const MAX_GROUP_PARTICIPANTS = 8;

const conversationParticipantsInclude = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          isOnline: true,
          lastSeenAt: true,
        },
      },
    },
  },
} as const;

function formatOneToOneConversation(
  conversation: {
    id: string;
    participants: {
      userId: string;
      user: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
        isOnline: boolean;
      };
    }[];
  },
  userId: string,
) {
  const otherParticipant = conversation.participants.find(p => p.userId !== userId);

  return {
    id: conversation.id,
    isGroup: false as const,
    name: otherParticipant?.user.displayName || 'Unknown',
    avatarUrl: otherParticipant?.user.avatarUrl || null,
    isOnline: otherParticipant?.user.isOnline || false,
    participants: conversation.participants.map(p => ({
      userId: p.user.id,
      displayName: p.user.displayName,
      avatarUrl: p.user.avatarUrl,
      isOnline: p.user.isOnline,
    })),
  };
}

// ── Validation schemas (SEC-07) ──
const sendDmMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content is required')
    .max(4000, 'Message content cannot exceed 4000 characters'),
  parentMessageId: z.string().uuid('Invalid parent message id').nullish(),
  // Client nonce for optimistic-send reconciliation (UX-01); echoed, not persisted.
  clientId: z.string().max(64).optional(),
});

/**
 * Build a display name for a group conversation.
 * Uses the custom name if set, otherwise comma-separated participant names
 * (excluding the requesting user).
 */
function getGroupDisplayName(
  conversation: { name?: string | null; participants: { user: { id: string; displayName: string } }[] },
  currentUserId: string
): string {
  if (conversation.name) return conversation.name;
  const otherNames = conversation.participants
    .filter(p => p.user.id !== currentUserId)
    .map(p => p.user.displayName);
  return otherNames.join(', ') || 'Group';
}

// ============================================
// GET ALL CONVERSATIONS
// ============================================

/**
 * GET /api/conversations
 * Get all conversations for the authenticated user
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeenAt: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Build unread count map in a SINGLE grouped query (PE-03).
    // Previously this fired one `message.count` per conversation (N+1). The
    // per-conversation threshold is each participant's own `lastReadAt`, so we
    // join the participant row and count messages newer than it in one pass.
    const conversationIds = conversations.map(c => c.id);
    const unreadCountMap = new Map<string, number>();
    if (conversationIds.length > 0) {
      const unreadRows = await prisma.$queryRaw<{ conversationId: string; count: number }[]>`
        SELECT m."conversationId" AS "conversationId", COUNT(*)::int AS "count"
        FROM "Message" m
        JOIN "ConversationParticipant" cp
          ON cp."conversationId" = m."conversationId" AND cp."userId" = ${userId}
        WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
          AND m."authorId" <> ${userId}
          AND m."createdAt" > cp."lastReadAt"
        GROUP BY m."conversationId"
      `;
      for (const row of unreadRows) {
        unreadCountMap.set(row.conversationId, Number(row.count));
      }
    }

    // Format conversations with other participant info and last message
    const formattedConversations = conversations.map(conv => {
      const otherParticipants = conv.participants.filter(p => p.userId !== userId);
      const lastMessage = conv.messages[0] || null;

      const displayInfo = conv.isGroup
        ? {
            name: getGroupDisplayName(conv, userId),
            avatarUrl: null,
            isOnline: false,
          }
        : {
            name: otherParticipants[0]?.user.displayName || 'Unknown',
            avatarUrl: otherParticipants[0]?.user.avatarUrl || null,
            isOnline: otherParticipants[0]?.user.isOnline || false,
            lastSeenAt: otherParticipants[0]?.user.lastSeenAt,
          };

      // Get mute status for the current user
      const myParticipant = conv.participants.find(p => p.userId === userId);

      return {
        id: conv.id,
        isGroup: conv.isGroup,
        ...(conv.isGroup && { groupName: conv.name || null, createdById: conv.createdById || null }),
        ...displayInfo,
        participants: conv.participants.map(p => ({
          userId: p.user.id,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          isOnline: p.user.isOnline,
        })),
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              authorId: lastMessage.authorId,
              authorName: lastMessage.author.displayName,
              createdAt: lastMessage.createdAt,
            }
          : null,
        unreadCount: unreadCountMap.get(conv.id) || 0,
        isMuted: myParticipant?.isMuted ?? false,
        updatedAt: conv.updatedAt,
      };
    });

    res.json({
      success: true,
      data: { conversations: formattedConversations },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CREATE CONVERSATION
// ============================================

/**
 * POST /api/conversations
 * Create a new conversation (1:1 or group)
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { participantIds, name } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      throw new BadRequestError('participantIds must be a non-empty array');
    }

    // Remove duplicates and ensure current user is included
    const uniqueParticipantIds = [...new Set([userId, ...participantIds])];

    if (uniqueParticipantIds.length < 2) {
      throw new BadRequestError('A conversation requires at least 2 participants');
    }

    // Check if it's a 1:1 conversation and if one already exists
    const isGroup = uniqueParticipantIds.length > 2;

    // Group DMs require at least 3 participants (you + 2 others)
    if (isGroup && uniqueParticipantIds.length < 3) {
      throw new BadRequestError('A group conversation requires at least 3 participants');
    }

    // Enforce max participants for groups
    if (isGroup && uniqueParticipantIds.length > MAX_GROUP_PARTICIPANTS) {
      throw new BadRequestError(`A group conversation can have at most ${MAX_GROUP_PARTICIPANTS} participants`);
    }

    // Validate group name if provided
    if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        throw new BadRequestError('Group name must be a string');
      }
      if (name.trim().length > 100) {
        throw new BadRequestError('Group name cannot exceed 100 characters');
      }
    }

    if (!isGroup) {
      const otherUserId = uniqueParticipantIds.find(id => id !== userId)!;
      const dmKey = buildDirectMessageKey(userId, otherUserId);

      const findExistingOneToOne = async () => {
        const byKey = await prisma.conversation.findUnique({
          where: { directMessageKey: dmKey },
          include: conversationParticipantsInclude,
        });
        if (byKey) return byKey;

        // Legacy rows created before directMessageKey existed.
        return prisma.conversation.findFirst({
          where: {
            isGroup: false,
            directMessageKey: null,
            AND: [
              { participants: { some: { userId } } },
              { participants: { some: { userId: otherUserId } } },
            ],
          },
          include: conversationParticipantsInclude,
        });
      };

      const returnExistingOneToOne = async (
        existingConversation: NonNullable<Awaited<ReturnType<typeof findExistingOneToOne>>>,
      ) => {
        if (!existingConversation.directMessageKey) {
          await prisma.conversation.update({
            where: { id: existingConversation.id },
            data: { directMessageKey: dmKey },
          }).catch(() => {
            // Another request may have backfilled first — safe to ignore.
          });
        }

        return res.json({
          success: true,
          data: {
            conversation: formatOneToOneConversation(existingConversation, userId),
            isExisting: true,
          },
        });
      };

      const existingConversation = await findExistingOneToOne();
      if (existingConversation) {
        return returnExistingOneToOne(existingConversation);
      }
    }

    // Verify all participants exist
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueParticipantIds } },
      select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
    });

    if (users.length !== uniqueParticipantIds.length) {
      throw new BadRequestError('One or more participants not found');
    }

    // Create the conversation
    const groupName = isGroup && name?.trim() ? name.trim() : null;

    let conversation;
    try {
      conversation = await prisma.conversation.create({
        data: {
          isGroup,
          name: groupName,
          createdById: isGroup ? userId : null,
          directMessageKey: isGroup ? null : buildDirectMessageKey(userId, uniqueParticipantIds.find(id => id !== userId)!),
          participants: {
            create: uniqueParticipantIds.map(pId => ({
              userId: pId,
            })),
          },
        },
        include: conversationParticipantsInclude,
      });
    } catch (error) {
      // Race: two clients created the same 1:1 at once — return the winner.
      if (
        !isGroup &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const dmKey = buildDirectMessageKey(userId, uniqueParticipantIds.find(id => id !== userId)!);
        const raced = await prisma.conversation.findUnique({
          where: { directMessageKey: dmKey },
          include: conversationParticipantsInclude,
        });
        if (raced) {
          return res.json({
            success: true,
            data: {
              conversation: formatOneToOneConversation(raced, userId),
              isExisting: true,
            },
          });
        }
      }
      throw error;
    }

    const otherParticipants = conversation.participants.filter(p => p.userId !== userId);
    const displayInfo = isGroup
      ? {
          name: getGroupDisplayName(conversation, userId),
          avatarUrl: null,
          isOnline: false,
        }
      : {
          name: otherParticipants[0]?.user.displayName || 'Unknown',
          avatarUrl: otherParticipants[0]?.user.avatarUrl || null,
          isOnline: otherParticipants[0]?.user.isOnline || false,
        };

    const conversationResponse = {
      id: conversation.id,
      isGroup,
      ...(isGroup && { groupName: groupName, createdById: userId }),
      ...displayInfo,
      participants: conversation.participants.map(p => ({
        userId: p.user.id,
        displayName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        isOnline: p.user.isOnline,
      })),
    };

    // Emit socket event for group creation so participants are notified
    if (isGroup) {
      const io = req.app.get('io');
      if (io) {
        // Notify each participant (except creator) via their personal room
        for (const pId of uniqueParticipantIds) {
          if (pId !== userId) {
            io.to(`user:${pId}`).emit('group:created', {
              conversation: conversationResponse,
            });
          }
        }
      }
    }

    res.status(201).json({
      success: true,
      data: {
        conversation: conversationResponse,
        isExisting: false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET SINGLE CONVERSATION
// ============================================

/**
 * GET /api/conversations/:id
 * Get a single conversation by ID
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    const otherParticipants = conversation.participants.filter(p => p.userId !== userId);
    const displayInfo = conversation.isGroup
      ? {
          name: getGroupDisplayName(conversation, userId),
          avatarUrl: null,
          isOnline: false,
        }
      : {
          name: otherParticipants[0]?.user.displayName || 'Unknown',
          avatarUrl: otherParticipants[0]?.user.avatarUrl || null,
          isOnline: otherParticipants[0]?.user.isOnline || false,
          lastSeenAt: otherParticipants[0]?.user.lastSeenAt,
        };

    res.json({
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          isGroup: conversation.isGroup,
          ...(conversation.isGroup && { groupName: conversation.name || null, createdById: conversation.createdById || null }),
          ...displayInfo,
          participants: conversation.participants.map(p => ({
            userId: p.user.id,
            displayName: p.user.displayName,
            avatarUrl: p.user.avatarUrl,
            isOnline: p.user.isOnline,
            lastSeenAt: p.user.lastSeenAt,
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET MESSAGES
// ============================================

/**
 * GET /api/conversations/:id/messages
 * Get messages for a conversation
 */
router.get('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { limit = '50', before } = req.query;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    const take = parseInt(limit as string);
    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        parentMessageId: null,
        ...(before && { createdAt: { lt: new Date(before as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            mimeType: true,
            fileSize: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // For messages with replies, fetch the latest 3 unique reply authors
    const messageIds = messages.filter(m => m.replyCount > 0).map(m => m.id);
    let replyAuthorsByParent: Record<string, { id: string; displayName: string; avatarUrl: string | null }[]> = {};
    if (messageIds.length > 0) {
      const recentReplies = await prisma.message.findMany({
        where: { parentMessageId: { in: messageIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          parentMessageId: true,
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      for (const reply of recentReplies) {
        const pid = reply.parentMessageId!;
        if (!replyAuthorsByParent[pid]) replyAuthorsByParent[pid] = [];
        const arr = replyAuthorsByParent[pid];
        if (arr.length < 3 && !arr.some(a => a.id === reply.author.id)) {
          arr.push(reply.author);
        }
      }
    }

    // Only update read cursor on initial load, not on "load more" pagination
    if (!before) {
      await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: new Date() },
      });
    }

    // Group reactions by emoji
    const formatReactions = (reactions: any[]) => {
      const grouped = reactions.reduce((acc, r) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push({ id: r.user.id, displayName: r.user.displayName });
        return acc;
      }, {} as Record<string, any>);
      return Object.values(grouped);
    };

    // Get file category from mime type
    const getFileCategory = (mimeType: string): string => {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
      return 'document';
    };

    res.json({
      success: true,
      data: {
        messages: messages.reverse().map(msg => ({
          id: msg.id,
          content: msg.content,
          authorId: msg.author.id,
          authorName: msg.author.displayName,
          authorAvatar: msg.author.avatarUrl,
          isEdited: msg.isEdited,
          isPinned: msg.isPinned,
          replyCount: msg.replyCount,
          lastReplyAt: msg.lastReplyAt,
          parentMessageId: msg.parentMessageId,
          latestReplyAuthors: replyAuthorsByParent[msg.id] || [],
          attachments: (msg.attachments || []).map((att: any) => ({
            ...att,
            category: getFileCategory(att.mimeType),
          })),
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt,
          reactions: formatReactions(msg.reactions),
        })),
        hasMore: messages.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// SEND MESSAGE
// ============================================

/**
 * POST /api/conversations/:id/messages
 * Send a message in a conversation
 */
router.post('/:id/messages', authenticate, messageRateLimiter, validateBody(sendDmMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { content, parentMessageId, clientId } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Validate parent message for thread replies
    if (parentMessageId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentMessageId },
        select: { id: true, conversationId: true, parentMessageId: true },
      });
      if (!parentMessage) {
        throw new NotFoundError('Parent message not found');
      }
      if (parentMessage.conversationId !== id) {
        throw new BadRequestError('Parent message does not belong to this conversation');
      }
      if (parentMessage.parentMessageId) {
        throw new BadRequestError('Cannot reply to a thread reply — reply to the parent message instead');
      }
    }

    // Persist the message and its side effects atomically (DAT-01): message
    // insert, parent thread counter, conversation bump, and sender read cursor.
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId: id,
          authorId: userId,
          content: content.trim(),
          parentMessageId: parentMessageId || null,
        },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      if (parentMessageId) {
        await tx.message.update({
          where: { id: parentMessageId },
          data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
        });
      }

      await tx.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      await tx.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: new Date() },
      });

      return created;
    });

    // Format the message response
    const messageResponse = {
      id: message.id,
      content: message.content,
      authorId: message.author.id,
      authorName: message.author.displayName,
      authorAvatar: message.author.avatarUrl,
      isEdited: message.isEdited,
      isPinned: message.isPinned,
      parentMessageId: message.parentMessageId,
      attachments: [],
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      clientId, // echoed for optimistic-send reconciliation (UX-01)
    };

    // Emit real-time events
    const io = req.app.get('io');
    if (io) {
      // 1. Emit new message to users currently in the conversation
      io.to(`conversation:${id}`).emit('new_dm_message', {
        conversationId: id,
        message: messageResponse,
      });

      // 1b. If this is a thread reply, emit thread metadata update for the parent message
      if (parentMessageId) {
        const updatedParent = await prisma.message.findUnique({
          where: { id: parentMessageId },
          select: { replyCount: true, lastReplyAt: true },
        });
        const recentReplies = await prisma.message.findMany({
          where: { parentMessageId },
          orderBy: { createdAt: 'desc' },
          select: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
        });
        const uniqueAuthors: { id: string; displayName: string; avatarUrl: string | null }[] = [];
        for (const r of recentReplies) {
          if (uniqueAuthors.length >= 3) break;
          if (!uniqueAuthors.some(a => a.id === r.author.id)) uniqueAuthors.push(r.author);
        }
        io.to(`conversation:${id}`).emit('thread:reply_added', {
          parentMessageId,
          replyCount: updatedParent?.replyCount || 0,
          lastReplyAt: updatedParent?.lastReplyAt,
          latestReplyAuthors: uniqueAuthors,
        });
      }
      
      // 2. Get other participants to notify about unread
      const otherParticipants = await prisma.conversationParticipant.findMany({
        where: {
          conversationId: id,
          userId: { not: userId },
        },
        select: { userId: true },
      });
      
      // 3. Emit unread notification to each participant, excluding sockets
      //    already in the conversation room server-side (RT-02).
      for (const otherParticipant of otherParticipants) {
        // Emit to the user's personal room (they join this on authenticate)
        io.to(`user:${otherParticipant.userId}`)
          .except(`conversation:${id}`)
          .emit('unread:dm', {
            conversationId: id,
            recipientUserId: otherParticipant.userId,
            senderId: userId,
          });
      }
    }

    // ── Push Notifications (fire-and-forget) ──
    (async () => {
      try {
        // Get other participants who have NOT muted this conversation
        const recipientParticipants = await prisma.conversationParticipant.findMany({
          where: {
            conversationId: id,
            userId: { not: userId },
            isMuted: false,
          },
          select: { userId: true },
        });

        const recipientIds = recipientParticipants.map(p => p.userId);
        if (recipientIds.length === 0) return;

        const authorName = message.author.displayName;
        await sendPushToUsers(recipientIds, buildDMNotification({
          authorName,
          messagePreview: content.trim(),
          conversationId: id,
        }), { excludeActiveInRoom: `conversation:${id}` });
      } catch (pushError) {
        console.error('[Push] DM message push failed:', pushError);
      }
    })();

    res.status(201).json({
      success: true,
      data: { message: messageResponse },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// EDIT MESSAGE
// ============================================

/**
 * PATCH /api/conversations/:id/messages/:messageId
 * Edit a message in a conversation
 */
router.patch('/:id/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id, messageId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Find the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.conversationId !== id) {
      throw new BadRequestError('Message does not belong to this conversation');
    }

    // Only author can edit their message
    if (message.authorId !== userId) {
      throw new ForbiddenError('You can only edit your own messages');
    }

    // Update the message
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        isEdited: true,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // Group reactions by emoji for client format
    const groupedReactions = updatedMessage.reactions.reduce((acc: any[], reaction: any) => {
      const existing = acc.find(r => r.emoji === reaction.emoji);
      if (existing) {
        existing.count++;
        existing.users.push(reaction.user);
      } else {
        acc.push({
          emoji: reaction.emoji,
          count: 1,
          users: [reaction.user],
        });
      }
      return acc;
    }, []);

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('dm_message_updated', {
        conversationId: id,
        message: {
          id: updatedMessage.id,
          content: updatedMessage.content,
          authorId: updatedMessage.author.id,
          authorName: updatedMessage.author.displayName,
          authorAvatar: updatedMessage.author.avatarUrl,
          isEdited: updatedMessage.isEdited,
          isPinned: updatedMessage.isPinned,
          attachments: updatedMessage.attachments,
          reactions: groupedReactions,
          createdAt: updatedMessage.createdAt,
          updatedAt: updatedMessage.updatedAt,
        },
      });
    }

    res.json({
      success: true,
      data: {
        message: {
          id: updatedMessage.id,
          content: updatedMessage.content,
          authorId: updatedMessage.author.id,
          authorName: updatedMessage.author.displayName,
          authorAvatar: updatedMessage.author.avatarUrl,
          isEdited: updatedMessage.isEdited,
          isPinned: updatedMessage.isPinned,
          createdAt: updatedMessage.createdAt,
          updatedAt: updatedMessage.updatedAt,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DELETE MESSAGE
// ============================================

/**
 * DELETE /api/conversations/:id/messages/:messageId
 * Delete a message in a conversation
 */
router.delete('/:id/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id, messageId } = req.params;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Find the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, conversationId: true, parentMessageId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.conversationId !== id) {
      throw new BadRequestError('Message does not belong to this conversation');
    }

    // Only author can delete their message
    if (message.authorId !== userId) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    // Delete the message
    await prisma.message.delete({
      where: { id: messageId },
    });

    // If this was a thread reply, decrement parent's replyCount
    if (message.parentMessageId) {
      const updatedParent = await prisma.message.update({
        where: { id: message.parentMessageId },
        data: { replyCount: { decrement: 1 } },
        select: { replyCount: true, lastReplyAt: true },
      });
      const recentReplies = await prisma.message.findMany({
        where: { parentMessageId: message.parentMessageId },
        orderBy: { createdAt: 'desc' },
        select: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
      const uniqueAuthors: { id: string; displayName: string; avatarUrl: string | null }[] = [];
      for (const r of recentReplies) {
        if (uniqueAuthors.length >= 3) break;
        if (!uniqueAuthors.some(a => a.id === r.author.id)) uniqueAuthors.push(r.author);
      }

      const io2 = req.app.get('io');
      if (io2) {
        io2.to(`conversation:${id}`).emit('thread:reply_added', {
          parentMessageId: message.parentMessageId,
          replyCount: Math.max(0, updatedParent.replyCount),
          lastReplyAt: updatedParent.lastReplyAt,
          latestReplyAuthors: uniqueAuthors,
        });
      }
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('dm_message_deleted', {
        conversationId: id,
        messageId,
        parentMessageId: message.parentMessageId,
      });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// THREAD REPLIES
// ============================================

/**
 * GET /api/conversations/:id/messages/:messageId/thread
 * Get all replies for a parent message in a conversation (paginated, chronological)
 */
router.get('/:id/messages/:messageId/thread', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id, messageId } = req.params;
    const { limit = '50', before } = req.query;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Find the parent message
    const parentMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: {
          select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true },
        },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    if (!parentMessage) {
      throw new NotFoundError('Message not found');
    }

    if (parentMessage.conversationId !== id) {
      throw new BadRequestError('Message does not belong to this conversation');
    }

    // Fetch thread replies
    const take = Math.min(parseInt(limit as string, 10), 100);
    const whereClause: any = { parentMessageId: messageId };
    if (before) {
      whereClause.createdAt = { lt: new Date(before as string) };
    }

    const replies = await prisma.message.findMany({
      where: whereClause,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: {
          select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true },
        },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    // Format reactions helper
    const formatReactions = (reactions: any[]) => {
      const grouped = reactions.reduce((acc: Record<string, any>, r: any) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push({ id: r.user.id, displayName: r.user.displayName });
        return acc;
      }, {});
      return Object.values(grouped);
    };

    const getFileCategory = (mimeType: string): string => {
      if (mimeType.startsWith('image/')) return 'image';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
      return 'document';
    };

    // Format parent message
    const parentFormatted = {
      id: parentMessage.id,
      content: parentMessage.content,
      authorId: parentMessage.author.id,
      authorName: parentMessage.author.displayName,
      authorAvatar: parentMessage.author.avatarUrl,
      isEdited: parentMessage.isEdited,
      isPinned: parentMessage.isPinned,
      replyCount: parentMessage.replyCount,
      lastReplyAt: parentMessage.lastReplyAt,
      attachments: parentMessage.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(parentMessage.reactions),
      createdAt: parentMessage.createdAt,
      updatedAt: parentMessage.updatedAt,
    };

    // Format replies (chronological)
    const formattedReplies = replies.reverse().map(reply => ({
      id: reply.id,
      content: reply.content,
      authorId: reply.author.id,
      authorName: reply.author.displayName,
      authorAvatar: reply.author.avatarUrl,
      isEdited: reply.isEdited,
      isPinned: reply.isPinned,
      parentMessageId: reply.parentMessageId,
      attachments: reply.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(reply.reactions),
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
    }));

    res.json({
      success: true,
      data: {
        parentMessage: parentFormatted,
        replies: formattedReplies,
        hasMore: replies.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// MARK AS READ
// ============================================

/**
 * POST /api/conversations/:id/read
 * Mark conversation as read
 */
router.post('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    res.json({
      success: true,
      message: 'Conversation marked as read',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// MUTE CONVERSATION
// ============================================

/**
 * POST /api/conversations/:id/mute
 * Toggle mute status for a conversation. If body includes { muted: true/false },
 * sets explicitly; otherwise toggles current state.
 */
router.post('/:id/mute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { muted } = req.body;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    const newMuted = typeof muted === 'boolean' ? muted : !participant.isMuted;

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { isMuted: newMuted },
    });

    res.json({
      success: true,
      data: { conversationId: id, isMuted: newMuted },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/conversations/:id/mute
 * Get mute status for a conversation
 */
router.get('/:id/mute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId: id } },
      select: { isMuted: true },
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    res.json({
      success: true,
      data: { conversationId: id, isMuted: participant.isMuted },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// UPDATE GROUP CONVERSATION (Rename)
// ============================================

/**
 * PATCH /api/conversations/:id
 * Update a group conversation (rename). Only participants can rename.
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    if (!conversation.isGroup) {
      throw new BadRequestError('Cannot rename a 1:1 conversation');
    }

    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Validate name
    if (name !== undefined && name !== null && name !== '') {
      if (typeof name !== 'string') {
        throw new BadRequestError('Group name must be a string');
      }
      if (name.trim().length > 100) {
        throw new BadRequestError('Group name cannot exceed 100 characters');
      }
    }

    const newName = name === '' || name === null ? null : (name?.trim() || null);

    const updated = await prisma.conversation.update({
      where: { id },
      data: { name: newName },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
            },
          },
        },
      },
    });

    const displayName = getGroupDisplayName(updated, userId);

    // Emit socket event to all participants
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('group:updated', {
        conversationId: id,
        name: newName,
        displayName,
        updatedBy: userId,
      });

      // Also notify via personal rooms for participants not currently in the conversation room
      for (const p of updated.participants) {
        io.to(`user:${p.userId}`).emit('group:updated', {
          conversationId: id,
          name: newName,
          displayName: getGroupDisplayName(updated, p.userId),
          updatedBy: userId,
        });
      }
    }

    res.json({
      success: true,
      data: {
        conversation: {
          id: updated.id,
          isGroup: true,
          groupName: newName,
          name: displayName,
          createdById: updated.createdById,
          participants: updated.participants.map(p => ({
            userId: p.user.id,
            displayName: p.user.displayName,
            avatarUrl: p.user.avatarUrl,
            isOnline: p.user.isOnline,
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADD PARTICIPANT TO GROUP
// ============================================

/**
 * POST /api/conversations/:id/participants
 * Add a member to a group conversation. Any participant can add members.
 */
router.post('/:id/participants', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new BadRequestError('userIds must be a non-empty array');
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    if (!conversation.isGroup) {
      throw new BadRequestError('Cannot add participants to a 1:1 conversation');
    }

    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    // Filter out users who are already participants
    const existingUserIds = new Set(conversation.participants.map(p => p.userId));
    const newUserIds = [...new Set(userIds)].filter(uid => !existingUserIds.has(uid));

    if (newUserIds.length === 0) {
      throw new BadRequestError('All specified users are already participants');
    }

    // Check max participants
    const totalAfterAdd = conversation.participants.length + newUserIds.length;
    if (totalAfterAdd > MAX_GROUP_PARTICIPANTS) {
      throw new BadRequestError(
        `Cannot exceed ${MAX_GROUP_PARTICIPANTS} participants. Currently ${conversation.participants.length}, trying to add ${newUserIds.length}.`
      );
    }

    // Verify all new users exist
    const newUsers = await prisma.user.findMany({
      where: { id: { in: newUserIds } },
      select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
    });

    if (newUsers.length !== newUserIds.length) {
      throw new BadRequestError('One or more users not found');
    }

    // Add participants
    await prisma.conversationParticipant.createMany({
      data: newUserIds.map(uid => ({
        userId: uid,
        conversationId: id,
      })),
    });

    // Fetch updated conversation
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true, isOnline: true },
            },
          },
        },
      },
    });

    // Emit socket events
    const io = req.app.get('io');
    if (io) {
      const addedByUser = conversation.participants.find(p => p.userId === userId);

      // Notify existing participants that new members were added
      io.to(`conversation:${id}`).emit('group:participant_added', {
        conversationId: id,
        addedUsers: newUsers.map(u => ({
          userId: u.id,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
          isOnline: u.isOnline,
        })),
        addedBy: userId,
      });

      // Notify existing participants via personal rooms too
      for (const p of conversation.participants) {
        io.to(`user:${p.userId}`).emit('group:participant_added', {
          conversationId: id,
          addedUsers: newUsers.map(u => ({
            userId: u.id,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            isOnline: u.isOnline,
          })),
          addedBy: userId,
        });
      }

      // Notify new participants that they were added to a group
      const allParticipants = updatedConversation!.participants;
      for (const newUser of newUsers) {
        io.to(`user:${newUser.id}`).emit('group:created', {
          conversation: {
            id: updatedConversation!.id,
            isGroup: true,
            groupName: updatedConversation!.name || null,
            name: getGroupDisplayName(updatedConversation!, newUser.id),
            createdById: updatedConversation!.createdById,
            participants: allParticipants.map(p => ({
              userId: p.user.id,
              displayName: p.user.displayName,
              avatarUrl: p.user.avatarUrl,
              isOnline: p.user.isOnline,
            })),
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        conversation: {
          id: updatedConversation!.id,
          isGroup: true,
          groupName: updatedConversation!.name || null,
          name: getGroupDisplayName(updatedConversation!, userId),
          createdById: updatedConversation!.createdById,
          participants: updatedConversation!.participants.map(p => ({
            userId: p.user.id,
            displayName: p.user.displayName,
            avatarUrl: p.user.avatarUrl,
            isOnline: p.user.isOnline,
          })),
        },
        addedUsers: newUsers.map(u => ({
          userId: u.id,
          displayName: u.displayName,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DELETE/LEAVE CONVERSATION
// ============================================

/**
 * DELETE /api/conversations/:id
 * Leave a conversation (group) or delete it (1:1).
 * For groups: removes the participant, deletes conversation if no participants remain.
 * For 1:1: deletes the entire conversation.
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, displayName: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    if (!conversation.isGroup) {
      // For 1:1 conversations, delete the whole conversation
      await prisma.conversation.delete({
        where: { id },
      });

      return res.json({
        success: true,
        message: 'Conversation deleted',
      });
    }

    // For group conversations, remove the participant
    await prisma.conversationParticipant.delete({
      where: { userId_conversationId: { userId, conversationId: id } },
    });

    const leavingUser = conversation.participants.find(p => p.userId === userId);

    // Check remaining participants
    const remainingCount = conversation.participants.length - 1;

    if (remainingCount === 0) {
      // No one left, delete the conversation
      await prisma.conversation.delete({
        where: { id },
      });
    } else {
      // Notify remaining participants
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${id}`).emit('group:participant_left', {
          conversationId: id,
          userId,
          displayName: leavingUser?.user.displayName || 'Unknown',
          remainingCount,
        });

        // Also notify via personal rooms
        for (const p of conversation.participants) {
          if (p.userId !== userId) {
            io.to(`user:${p.userId}`).emit('group:participant_left', {
              conversationId: id,
              userId,
              displayName: leavingUser?.user.displayName || 'Unknown',
              remainingCount,
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Left the conversation',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// MESSAGE PINNING
// ============================================

/**
 * POST /api/conversations/:id/messages/:messageId/pin
 * Pin a message in a conversation.
 * Any participant can pin a message.
 */
router.post('/:id/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: conversationId, messageId } = req.params;
    const userId = req.user!.id;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenError('You are not a participant in this conversation');

    // Verify message exists in this conversation
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, isPinned: true, parentMessageId: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.conversationId !== conversationId) throw new BadRequestError('Message does not belong to this conversation');
    if (message.parentMessageId) throw new BadRequestError('Thread replies cannot be pinned');
    if (message.isPinned) {
      return res.json({ success: true, message: 'Message is already pinned' });
    }

    // Pin the message
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true } },
      },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message_pinned', {
        conversationId,
        message: updated,
        pinnedBy: { id: userId, displayName: req.user!.displayName },
      });
    }

    res.json({ success: true, data: { message: updated } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/conversations/:id/messages/:messageId/pin
 * Unpin a message in a conversation.
 * Any participant can unpin a message.
 */
router.delete('/:id/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: conversationId, messageId } = req.params;
    const userId = req.user!.id;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenError('You are not a participant in this conversation');

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, isPinned: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.conversationId !== conversationId) throw new BadRequestError('Message does not belong to this conversation');
    if (!message.isPinned) {
      return res.json({ success: true, message: 'Message is not pinned' });
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${conversationId}`).emit('message_unpinned', {
        conversationId,
        messageId,
        unpinnedBy: { id: userId, displayName: req.user!.displayName },
      });
    }

    res.json({ success: true, message: 'Message unpinned' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/conversations/:id/pinned
 * Get all pinned messages in a conversation (newest pin first).
 */
router.get('/:id/pinned', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: conversationId } = req.params;
    const userId = req.user!.id;

    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { userId_conversationId: { userId, conversationId } },
    });
    if (!participant) throw new ForbiddenError('You are not a participant in this conversation');

    const pinnedMessages = await prisma.message.findMany({
      where: { conversationId, isPinned: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true } },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    // Group reactions and format in DM message shape
    const formatted = pinnedMessages.map(msg => {
      const reactionMap = new Map<string, { emoji: string; count: number; users: { id: string; displayName: string }[] }>();
      for (const r of msg.reactions) {
        const existing = reactionMap.get(r.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(r.user);
        } else {
          reactionMap.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.user] });
        }
      }
      return {
        id: msg.id,
        content: msg.content,
        authorId: msg.author.id,
        authorName: msg.author.displayName,
        authorAvatar: msg.author.avatarUrl,
        isEdited: msg.isEdited,
        isPinned: msg.isPinned,
        attachments: msg.attachments,
        reactions: Array.from(reactionMap.values()),
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
      };
    });

    res.json({ success: true, data: { messages: formatted, count: formatted.length } });
  } catch (error) {
    next(error);
  }
});

export default router;
