/**
 * Channel Routes
 * Handles channel details and message operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { getFileCategory } from '../config/supabase';
import { Permissions, hasPermission } from '../utils/permissions';
import { getUserPermissions } from '../utils/roleHelpers';
import { canAccessChannel } from '../utils/access';
import { messageRateLimiter } from '../middleware/rateLimit';
import {
  resolveChannelMentions,
  collectChannelMentionRecipients,
  incrementMentionCounts,
  emitChannelUnreadEvents,
  pushChannelMessage,
} from '../services/messageDispatch';

const router = Router();

// ── Validation schemas (SEC-07) ──
const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content is required')
    .max(4000, 'Message content cannot exceed 4000 characters'),
  parentMessageId: z.string().uuid('Invalid parent message id').nullish(),
  // Client-generated nonce for optimistic-send reconciliation (UX-01). Echoed
  // back on the REST response and the socket broadcast; not persisted.
  clientId: z.string().max(64).optional(),
});

const editMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content is required')
    .max(4000, 'Message content cannot exceed 4000 characters'),
});

const markReadSchema = z.object({
  lastReadMessageId: z.string().nullish(),
});

const muteChannelSchema = z.object({
  muted: z.boolean().optional(),
});

/**
 * GET /api/channels/:id
 * Get channel details
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: {
        program: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check if user is a member of the program
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
      include: {
        memberRoles: {
          include: {
            role: {
              select: { id: true, tier: true, permissions: true },
            },
          },
        },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Check private channel access
    if (channel.isPrivate && membership) {
      const userTier = membership.memberRoles.length 
        ? Math.min(...membership.memberRoles.map(mr => mr.role.tier))
        : 2;
      
      // Admins (tier 0-1) can always access
      if (userTier > 1 && !req.user!.isSuperAdmin) {
        // Check if user has explicit permission
        const hasOverride = await prisma.permissionOverride.findFirst({
          where: {
            channelId: id,
            OR: [
              { userId },
              { roleId: { in: membership.memberRoles.map(mr => mr.role.id) } },
            ],
            allow: { gt: BigInt(0) },
          },
        });

        if (!hasOverride) {
          throw new ForbiddenError('You do not have access to this private channel');
        }
      }
    }

    // Determine if user can post (for announcement channels)
    const userPerms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
    const canPost = channel.type !== 'ANNOUNCEMENT' || hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS);
    const canManageMessages = hasPermission(userPerms, Permissions.MANAGE_MESSAGES);

    res.json({
      success: true,
      data: { 
        channel: {
          ...channel,
          canPost,
          canManageMessages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/messages
 * Get messages in a channel with pagination
 */
router.get('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { limit = '50', before, after } = req.query;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true, isPrivate: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
      include: {
        memberRoles: {
          include: {
            role: {
              select: { id: true, tier: true },
            },
          },
        },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Check private channel access
    if (channel.isPrivate && membership) {
      const userTier = membership.memberRoles.length 
        ? Math.min(...membership.memberRoles.map(mr => mr.role.tier))
        : 2;
      
      // Admins (tier 0-1) can always access
      if (userTier > 1 && !req.user!.isSuperAdmin) {
        // Check if user has explicit permission
        const hasOverride = await prisma.permissionOverride.findFirst({
          where: {
            channelId: id,
            OR: [
              { userId },
              { roleId: { in: membership.memberRoles.map(mr => mr.role.id) } },
            ],
            allow: { gt: BigInt(0) },
          },
        });

        if (!hasOverride) {
          throw new ForbiddenError('You do not have access to this private channel');
        }
      }
    }

    // Build query — exclude thread replies from the main list
    const take = Math.min(parseInt(limit as string, 10), 100);
    const whereClause: any = { channelId: id, parentMessageId: null };

    if (before) {
      whereClause.createdAt = { lt: new Date(before as string) };
    } else if (after) {
      whereClause.createdAt = { gt: new Date(after as string) };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      take,
      orderBy: { createdAt: 'desc' },
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
      // Group by parent and deduplicate authors, keeping last 3 unique
      for (const reply of recentReplies) {
        const pid = reply.parentMessageId!;
        if (!replyAuthorsByParent[pid]) replyAuthorsByParent[pid] = [];
        const arr = replyAuthorsByParent[pid];
        if (arr.length < 3 && !arr.some(a => a.id === reply.author.id)) {
          arr.push(reply.author);
        }
      }
    }

    // Reverse to get chronological order and format reactions/attachments
    const orderedMessages = messages.reverse().map((msg) => {
      // Group reactions by emoji
      const groupedReactions = msg.reactions.reduce((acc: Record<string, { emoji: string; count: number; users: { id: string; displayName: string }[] }>, r) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push({ id: r.user.id, displayName: r.user.displayName });
        return acc;
      }, {});

      // Add category to attachments
      const attachmentsWithCategory = msg.attachments.map(att => ({
        ...att,
        category: getFileCategory(att.mimeType),
      }));

      return {
        ...msg,
        attachments: attachmentsWithCategory,
        reactions: Object.values(groupedReactions),
        latestReplyAuthors: replyAuthorsByParent[msg.id] || [],
      };
    });

    res.json({
      success: true,
      data: {
        messages: orderedMessages,
        hasMore: messages.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/channels/:id/messages
 * Send a message to a channel
 */
router.post('/:id/messages', authenticate, messageRateLimiter, validateBody(sendMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { content, parentMessageId, clientId } = req.body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    if (content.length > 4000) {
      throw new BadRequestError('Message content cannot exceed 4000 characters');
    }

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: {
        id: true,
        programId: true,
        type: true,
        name: true,
        isPrivate: true,
        program: { select: { name: true } },
      },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Private channel access (SEC-03): posting requires the same view access
    // enforced on reads.
    if (channel.isPrivate && !(await canAccessChannel(userId, id, req.user!.isSuperAdmin))) {
      throw new ForbiddenError('You do not have access to this private channel');
    }

    // Permission checks
    const userPerms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);

    // Check SEND_MESSAGES permission
    if (!hasPermission(userPerms, Permissions.SEND_MESSAGES)) {
      throw new ForbiddenError('You do not have permission to send messages');
    }

    // Announcement channels require SEND_IN_ANNOUNCEMENTS
    if (channel.type === 'ANNOUNCEMENT') {
      if (!hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS)) {
        throw new ForbiddenError('You do not have permission to post in announcement channels');
      }
    }

    // Resolve mentions. @everyone/@here only honored with MENTION_EVERYONE (SEC-04).
    const canMentionEveryone = hasPermission(userPerms, Permissions.MENTION_EVERYONE);
    const mentions = await resolveChannelMentions(content, channel.programId, canMentionEveryone);
    const { mentionedUsers, mentionedRoles, mentionEveryone } = mentions;

    // Validate parent message for thread replies
    if (parentMessageId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentMessageId },
        select: { id: true, channelId: true, parentMessageId: true },
      });
      if (!parentMessage) {
        throw new NotFoundError('Parent message not found');
      }
      if (parentMessage.channelId !== id) {
        throw new BadRequestError('Parent message does not belong to this channel');
      }
      if (parentMessage.parentMessageId) {
        throw new BadRequestError('Cannot reply to a thread reply — reply to the parent message instead');
      }
    }

    // Users to notify for this message's mentions (author excluded).
    const mentionRecipientIds = await collectChannelMentionRecipients(
      channel.programId,
      mentions,
      userId,
    );

    // Persist the message and all its side effects atomically (DAT-01/DAT-02):
    // message insert, parent thread counter, and mention-count bumps either all
    // succeed or all roll back.
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          authorId: userId,
          channelId: id,
          content: content.trim(),
          mentionedUsers,
          mentionedRoles,
          mentionEveryone,
          parentMessageId: parentMessageId || null,
        },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
          attachments: true,
        },
      });

      if (parentMessageId) {
        await tx.message.update({
          where: { id: parentMessageId },
          data: { replyCount: { increment: 1 }, lastReplyAt: new Date() },
        });
      }

      await incrementMentionCounts(tx, id, mentionRecipientIds);

      return created;
    });

    // Emit real-time events (after the transaction has committed).
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${id}`).emit('new_message', { ...message, parentMessageId: message.parentMessageId || null, clientId });

      // Thread metadata update for the parent message
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
        io.to(`channel:${id}`).emit('thread:reply_added', {
          parentMessageId,
          replyCount: updatedParent?.replyCount || 0,
          lastReplyAt: updatedParent?.lastReplyAt,
          latestReplyAuthors: uniqueAuthors,
        });
      }

      // Unread + mention events (clients currently in the channel ignore these).
      emitChannelUnreadEvents(io, {
        channelId: id,
        programId: channel.programId,
        authorId: userId,
        mentionRecipientIds,
      });
    }

    // Push notifications (fire-and-forget).
    pushChannelMessage({
      channelId: id,
      programId: channel.programId,
      channelName: channel.name,
      programName: channel.program.name,
      authorId: userId,
      authorName: message.author.displayName,
      content,
      mentions,
      mentionRecipientIds,
      hasAttachments: false,
    });

    res.status(201).json({
      success: true,
      data: { message: { ...message, clientId } },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/channels/:channelId/messages/:messageId
 * Edit a message
 */
router.patch('/:channelId/messages/:messageId', authenticate, validateBody(editMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new BadRequestError('Message does not belong to this channel');
    }

    // Re-check the user still has access to the channel (SEC-05): a removed
    // member, or someone who lost private-channel access, cannot edit.
    if (!req.user!.isSuperAdmin && !(await canAccessChannel(userId, channelId))) {
      throw new ForbiddenError('You do not have access to this channel');
    }

    // Only author can edit their message
    if (message.authorId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You can only edit your own messages');
    }

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

    const messageWithGroupedReactions = {
      ...updatedMessage,
      reactions: groupedReactions,
    };

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_updated', messageWithGroupedReactions);
    }

    res.json({
      success: true,
      data: { message: messageWithGroupedReactions },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/channels/:channelId/messages/:messageId
 * Delete a message
 */
router.delete('/:channelId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, parentMessageId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new BadRequestError('Message does not belong to this channel');
    }

    // Re-check the user still has access to the channel (SEC-05).
    if (!req.user!.isSuperAdmin && !(await canAccessChannel(userId, channelId))) {
      throw new ForbiddenError('You do not have access to this channel');
    }

    // Author can always delete their own; otherwise check MANAGE_MESSAGES permission
    if (message.authorId !== userId) {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { programId: true },
      });
      if (!channel) throw new NotFoundError('Channel not found');

      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to delete this message');
      }
    }

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
      // Fetch latest reply authors for the updated indicator
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
        io2.to(`channel:${channelId}`).emit('thread:reply_added', {
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
      io.to(`channel:${channelId}`).emit('message_deleted', { messageId, channelId, parentMessageId: message.parentMessageId });
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
 * GET /api/channels/messages/:messageId/thread
 * Get all replies for a parent message (paginated, chronological)
 */
router.get('/messages/:messageId/thread', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;
    const { limit = '50', before } = req.query;

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

    if (!parentMessage.channelId) {
      throw new BadRequestError('Message does not belong to a channel');
    }

    // Verify channel membership
    const channel = await prisma.channel.findUnique({
      where: { id: parentMessage.channelId },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
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

    // Format parent message
    const parentFormatted = {
      ...parentMessage,
      attachments: parentMessage.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(parentMessage.reactions),
    };

    // Format replies (chronological)
    const formattedReplies = replies.reverse().map(reply => ({
      ...reply,
      attachments: reply.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(reply.reactions),
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
// CHANNEL READ STATUS
// ============================================

/**
 * POST /api/channels/:id/read
 * Mark channel as read
 */
router.post('/:id/read', authenticate, validateBody(markReadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { lastReadMessageId } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Upsert the channel read status
    await prisma.channelRead.upsert({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      create: {
        userId,
        channelId: id,
        lastReadAt: new Date(),
        lastReadMessageId: lastReadMessageId || null,
        mentionCount: 0,
      },
      update: {
        lastReadAt: new Date(),
        lastReadMessageId: lastReadMessageId || null,
        mentionCount: 0, // Reset mention count when marking as read
      },
    });

    res.json({
      success: true,
      message: 'Channel marked as read',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/unread
 * Get unread status for a channel
 */
router.get('/:id/unread', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Get the user's last read status
    const channelRead = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
    });

    // Count unread messages since lastReadAt
    const lastReadAt = channelRead?.lastReadAt || new Date(0);
    
    const unreadCount = await prisma.message.count({
      where: {
        channelId: id,
        createdAt: { gt: lastReadAt },
        authorId: { not: userId }, // Don't count own messages as unread
      },
    });

    res.json({
      success: true,
      data: {
        channelId: id,
        unreadCount,
        mentionCount: channelRead?.mentionCount || 0,
        lastReadAt: channelRead?.lastReadAt || null,
        isMuted: channelRead?.isMuted ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CHANNEL MUTE
// ============================================

/**
 * POST /api/channels/:id/mute
 * Toggle mute status for a channel. If body includes { muted: true/false },
 * sets explicitly; otherwise toggles current state.
 */
router.post('/:id/mute', authenticate, validateBody(muteChannelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { muted } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Get or create channel read record
    const existing = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
    });

    const newMuted = typeof muted === 'boolean' ? muted : !(existing?.isMuted ?? false);

    await prisma.channelRead.upsert({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      create: {
        userId,
        channelId: id,
        lastReadAt: new Date(),
        isMuted: newMuted,
      },
      update: {
        isMuted: newMuted,
      },
    });

    res.json({
      success: true,
      data: { channelId: id, isMuted: newMuted },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/mute
 * Get mute status for a channel
 */
router.get('/:id/mute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channelRead = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      select: { isMuted: true },
    });

    res.json({
      success: true,
      data: { channelId: id, isMuted: channelRead?.isMuted ?? false },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// MESSAGE PINNING
// ============================================

// getUserPermissions is imported from ../utils/roleHelpers

/**
 * POST /api/channels/:channelId/messages/:messageId/pin
 * Pin a message in a channel.
 * Requires: message author OR MANAGE_MESSAGES permission.
 */
router.post('/:channelId/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    // Verify message exists in this channel
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, isPinned: true, parentMessageId: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.channelId !== channelId) throw new BadRequestError('Message does not belong to this channel');
    if (message.parentMessageId) throw new BadRequestError('Thread replies cannot be pinned');
    if (message.isPinned) {
      return res.json({ success: true, message: 'Message is already pinned' });
    }

    // Verify channel and program membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    // Permission check: author or MANAGE_MESSAGES
    if (message.authorId !== userId) {
      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to pin this message');
      }
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
      io.to(`channel:${channelId}`).emit('message_pinned', {
        channelId,
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
 * DELETE /api/channels/:channelId/messages/:messageId/pin
 * Unpin a message in a channel.
 * Requires: message author OR MANAGE_MESSAGES permission.
 */
router.delete('/:channelId/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, isPinned: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.channelId !== channelId) throw new BadRequestError('Message does not belong to this channel');
    if (!message.isPinned) {
      return res.json({ success: true, message: 'Message is not pinned' });
    }

    // Verify channel and program membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    // Permission check: author or MANAGE_MESSAGES
    if (message.authorId !== userId) {
      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to unpin this message');
      }
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_unpinned', {
        channelId,
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
 * GET /api/channels/:channelId/pinned
 * Get all pinned messages in a channel (newest pin first).
 */
router.get('/:channelId/pinned', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId } = req.params;
    const userId = req.user!.id;

    // Verify channel and membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    const pinnedMessages = await prisma.message.findMany({
      where: { channelId, isPinned: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true } },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    // Group reactions
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
      const { reactions, ...rest } = msg;
      return {
        ...rest,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
        reactions: Array.from(reactionMap.values()),
      };
    });

    res.json({ success: true, data: { messages: formatted, count: formatted.length } });
  } catch (error) {
    next(error);
  }
});

export default router;
