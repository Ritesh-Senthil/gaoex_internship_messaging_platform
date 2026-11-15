/**
 * Message Reaction Routes
 * Handles adding and removing reactions on messages
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { canAccessChannel, canAccessConversation } from '../utils/access';
import { pushReaction } from '../services/messageDispatch';

const router = Router();

// Common emojis for quick reactions
const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

// ── Validation schemas (SEC-07) ──
const addReactionSchema = z.object({
  emoji: z.string().trim().min(1, 'Emoji is required').max(32, 'Emoji cannot exceed 32 characters'),
});

async function assertMessageVisible(
  message: { channelId: string | null; conversationId: string | null },
  userId: string,
  isSuperAdmin: boolean,
) {
  if (message.channelId) {
    if (!(await canAccessChannel(userId, message.channelId, isSuperAdmin))) {
      throw new ForbiddenError('You do not have access to this message');
    }
    return;
  }
  if (message.conversationId) {
    if (!(await canAccessConversation(userId, message.conversationId))) {
      throw new ForbiddenError('You do not have access to this message');
    }
  }
}

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

    await assertMessageVisible(message, userId, !!req.user!.isSuperAdmin);

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
router.post('/:messageId/reactions', authenticate, validateBody(addReactionSchema), async (req: Request, res: Response, next: NextFunction) => {
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

    await assertMessageVisible(message, userId, !!req.user!.isSuperAdmin);

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

    // The reaction is already stored. Push is best-effort and never changes
    // the response. Duplicate reactions return above, before this runs, and
    // removing a reaction does not notify anyone.
    pushReaction({
      messageId,
      reactorId: userId,
      reactorName: reaction.user.displayName,
      emoji,
    });

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

    if (decodedEmoji.length > 32) {
      throw new BadRequestError('Emoji cannot exceed 32 characters');
    }

    await assertMessageVisible(message, userId, !!req.user!.isSuperAdmin);

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
