/**
 * Conversation (Direct Message) Routes
 * Handles 1:1 and group DM conversations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

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

    // Format conversations with other participant info and last message
    const formattedConversations = conversations.map(conv => {
      const otherParticipants = conv.participants.filter(p => p.userId !== userId);
      const myParticipant = conv.participants.find(p => p.userId === userId);
      const lastMessage = conv.messages[0] || null;

      // For 1:1 conversations, use the other user's info
      // For group conversations, we'd need a group name (future feature)
      const displayInfo = conv.isGroup
        ? {
            name: `Group (${conv.participants.length} members)`,
            avatarUrl: null,
            isOnline: false,
          }
        : {
            name: otherParticipants[0]?.user.displayName || 'Unknown',
            avatarUrl: otherParticipants[0]?.user.avatarUrl || null,
            isOnline: otherParticipants[0]?.user.isOnline || false,
            lastSeenAt: otherParticipants[0]?.user.lastSeenAt,
          };

      // Calculate unread count
      const unreadCount = lastMessage && myParticipant
        ? (new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) ? 1 : 0)
        : 0;

      return {
        id: conv.id,
        isGroup: conv.isGroup,
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
        unreadCount,
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
    const { participantIds } = req.body;

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

    if (!isGroup) {
      const otherUserId = uniqueParticipantIds.find(id => id !== userId);

      // Check for existing 1:1 conversation
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: otherUserId } } },
          ],
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
        },
      });

      if (existingConversation) {
        // Return existing conversation
        const otherParticipant = existingConversation.participants.find(p => p.userId !== userId);

        return res.json({
          success: true,
          data: {
            conversation: {
              id: existingConversation.id,
              isGroup: false,
              name: otherParticipant?.user.displayName || 'Unknown',
              avatarUrl: otherParticipant?.user.avatarUrl || null,
              isOnline: otherParticipant?.user.isOnline || false,
              participants: existingConversation.participants.map(p => ({
                userId: p.user.id,
                displayName: p.user.displayName,
                avatarUrl: p.user.avatarUrl,
                isOnline: p.user.isOnline,
              })),
            },
            isExisting: true,
          },
        });
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
    const conversation = await prisma.conversation.create({
      data: {
        isGroup,
        participants: {
          create: uniqueParticipantIds.map(pId => ({
            userId: pId,
          })),
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
      },
    });

    const otherParticipants = conversation.participants.filter(p => p.userId !== userId);
    const displayInfo = isGroup
      ? {
          name: `Group (${conversation.participants.length} members)`,
          avatarUrl: null,
          isOnline: false,
        }
      : {
          name: otherParticipants[0]?.user.displayName || 'Unknown',
          avatarUrl: otherParticipants[0]?.user.avatarUrl || null,
          isOnline: otherParticipants[0]?.user.isOnline || false,
        };

    res.status(201).json({
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          isGroup,
          ...displayInfo,
          participants: conversation.participants.map(p => ({
            userId: p.user.id,
            displayName: p.user.displayName,
            avatarUrl: p.user.avatarUrl,
            isOnline: p.user.isOnline,
          })),
        },
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
          name: `Group (${conversation.participants.length} members)`,
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

    const messages = await prisma.message.findMany({
      where: {
        conversationId: id,
        ...(before && { createdAt: { lt: new Date(before as string) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
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

    // Update last read timestamp
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

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
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt,
          reactions: formatReactions(msg.reactions),
        })),
        hasMore: messages.length === parseInt(limit as string),
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
router.post('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
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

    // Create the message
    const message = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: userId,
        content: content.trim(),
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update conversation's updatedAt
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // Update sender's last read
    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    res.status(201).json({
      success: true,
      data: {
        message: {
          id: message.id,
          content: message.content,
          authorId: message.author.id,
          authorName: message.author.displayName,
          authorAvatar: message.author.avatarUrl,
          isEdited: message.isEdited,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        },
      },
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
      },
    });

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
      select: { id: true, authorId: true, conversationId: true },
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

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('dm_message_deleted', {
        conversationId: id,
        messageId,
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
// DELETE/LEAVE CONVERSATION
// ============================================

/**
 * DELETE /api/conversations/:id
 * Leave a conversation (or delete if last participant)
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    if (conversation.participants.length <= 2) {
      // For 1:1 or 2-person conversations, delete the whole conversation
      await prisma.conversation.delete({
        where: { id },
      });

      res.json({
        success: true,
        message: 'Conversation deleted',
      });
    } else {
      // For group conversations, just remove the user
      await prisma.conversationParticipant.delete({
        where: { userId_conversationId: { userId, conversationId: id } },
      });

      res.json({
        success: true,
        message: 'Left the conversation',
      });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
