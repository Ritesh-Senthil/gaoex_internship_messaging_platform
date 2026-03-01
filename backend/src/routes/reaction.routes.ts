/**
 * Message Reaction Routes
 * Handles adding and removing reactions on messages
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// Common emojis for quick reactions
const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

/**
 * GET /api/messages/:messageId/reactions
 * Get all reactions for a message
 */
router.get('/:messageId/reactions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user has access (member of channel's program or conversation participant)
    if (message.channelId) {
      const channel = await prisma.channel.findUnique({
        where: { id: message.channelId },
        select: { programId: true },
      });
      if (channel) {
        const membership = await prisma.programMembership.findUnique({
          where: { userId_programId: { userId, programId: channel.programId } },
        });
        if (!membership && !req.user!.isSuperAdmin) {
          throw new ForbiddenError('You do not have access to this message');
        }
      }
    } else if (message.conversationId) {
      const participant = await prisma.conversationParticipant.findUnique({
        where: { userId_conversationId: { userId, conversationId: message.conversationId } },
      });
      if (!participant) {
        throw new ForbiddenError('You do not have access to this message');
      }
    }

    // Get reactions grouped by emoji
    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    // Group by emoji
    const grouped = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
          hasReacted: false,
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push({
        id: reaction.user.id,
        displayName: reaction.user.displayName,
      });
      if (reaction.userId === userId) {
        acc[reaction.emoji].hasReacted = true;
      }
      return acc;
    }, {} as Record<string, { emoji: string; count: number; users: { id: string; displayName: string }[]; hasReacted: boolean }>);

    res.json({
      success: true,
      data: {
        reactions: Object.values(grouped),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/messages/:messageId/reactions
 * Add a reaction to a message
 */
router.post('/:messageId/reactions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.id;

    if (!emoji || typeof emoji !== 'string') {
      throw new BadRequestError('Emoji is required');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Verify user has access
    if (message.channelId) {
      const channel = await prisma.channel.findUnique({
        where: { id: message.channelId },
        select: { programId: true },
      });
      if (channel) {
        const membership = await prisma.programMembership.findUnique({
          where: { userId_programId: { userId, programId: channel.programId } },
        });
        if (!membership && !req.user!.isSuperAdmin) {
          throw new ForbiddenError('You do not have access to this message');
        }
      }
    } else if (message.conversationId) {
      const participant = await prisma.conversationParticipant.findUnique({
        where: { userId_conversationId: { userId, conversationId: message.conversationId } },
      });
      if (!participant) {
        throw new ForbiddenError('You do not have access to this message');
      }
    }

    // Check if reaction already exists
    const existingReaction = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    });

    if (existingReaction) {
      return res.json({
        success: true,
        data: { reaction: existingReaction },
        message: 'Reaction already exists',
      });
    }

    // Create reaction
    const reaction = await prisma.messageReaction.create({
      data: {
        messageId,
        userId,
        emoji,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const room = message.channelId 
        ? `channel:${message.channelId}` 
        : `conversation:${message.conversationId}`;
      io.to(room).emit('reaction_added', {
        messageId,
        emoji,
        user: {
          id: reaction.user.id,
          displayName: reaction.user.displayName,
        },
        channelId: message.channelId,
        conversationId: message.conversationId,
      });
    }

    res.status(201).json({
      success: true,
      data: { reaction },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/messages/:messageId/reactions/:emoji
 * Remove a reaction from a message
 */
router.delete('/:messageId/reactions/:emoji', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user!.id;

    const decodedEmoji = decodeURIComponent(emoji);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, conversationId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    // Find and delete the reaction
    const reaction = await prisma.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji: decodedEmoji } },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!reaction) {
      throw new NotFoundError('Reaction not found');
    }

    await prisma.messageReaction.delete({
      where: { id: reaction.id },
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      const room = message.channelId 
        ? `channel:${message.channelId}` 
        : `conversation:${message.conversationId}`;
      io.to(room).emit('reaction_removed', {
        messageId,
        emoji: decodedEmoji,
        user: {
          id: reaction.user.id,
          displayName: reaction.user.displayName,
        },
        channelId: message.channelId,
        conversationId: message.conversationId,
      });
    }

    res.json({
      success: true,
      message: 'Reaction removed',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reactions/common
 * Get list of common reaction emojis
 */
router.get('/common', authenticate, async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { emojis: COMMON_EMOJIS },
  });
});

export default router;
