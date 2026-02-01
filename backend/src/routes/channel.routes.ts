/**
 * Channel Routes
 * Handles channel details and message operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

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
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    res.json({
      success: true,
      data: { channel },
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

    // Build query
    const take = Math.min(parseInt(limit as string, 10), 100);
    const whereClause: any = { channelId: id };

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

    // Reverse to get chronological order and format reactions
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

      return {
        ...msg,
        reactions: Object.values(groupedReactions),
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
router.post('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    if (content.length > 4000) {
      throw new BadRequestError('Message content cannot exceed 4000 characters');
    }

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true, type: true },
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

    // TODO: Check permissions for announcement channels
    // For now, allow all members to post

    // Parse mentions from content
    const mentionedUsers: string[] = [];
    const mentionedRoles: string[] = [];
    let mentionEveryone = false;

    // Check for @everyone or @here
    if (content.includes('@everyone') || content.includes('@here')) {
      mentionEveryone = true;
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        authorId: userId,
        channelId: id,
        content: content.trim(),
        mentionedUsers,
        mentionedRoles,
        mentionEveryone,
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
      },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${id}`).emit('new_message', message);
    }

    res.status(201).json({
      success: true,
      data: { message },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/channels/:channelId/messages/:messageId
 * Edit a message
 */
router.patch('/:channelId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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
      },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_updated', updatedMessage);
    }

    res.json({
      success: true,
      data: { message: updatedMessage },
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
      select: { id: true, authorId: true, channelId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new BadRequestError('Message does not belong to this channel');
    }

    // Only author or super admin can delete
    // TODO: Check for moderator permissions
    if (message.authorId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You can only delete your own messages');
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_deleted', { messageId, channelId });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
