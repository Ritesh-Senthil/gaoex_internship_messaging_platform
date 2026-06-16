/**
 * Message forwarding routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { messageRateLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { listForwardDestinations, forwardMessage } from '../services/forwardMessage';

const router = Router();

const forwardMessageSchema = z.object({
  messageId: z.string().uuid('Invalid message id'),
  destinationType: z.enum(['channel', 'conversation']),
  destinationId: z.string().uuid('Invalid destination id'),
  comment: z.string().max(500, 'Comment cannot exceed 500 characters').optional(),
});

/**
 * GET /api/forward/destinations
 * List channels and conversations the user can forward messages to.
 */
router.get('/destinations', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const excludeChannelId = typeof req.query.excludeChannelId === 'string' ? req.query.excludeChannelId : undefined;
    const excludeConversationId =
      typeof req.query.excludeConversationId === 'string' ? req.query.excludeConversationId : undefined;

    const destinations = await listForwardDestinations(
      userId,
      req.user!.isSuperAdmin,
      { channelId: excludeChannelId, conversationId: excludeConversationId },
    );

    res.json({ success: true, data: destinations });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/forward
 * Forward a message to a channel or conversation.
 */
router.post(
  '/',
  authenticate,
  messageRateLimiter,
  validateBody(forwardMessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { messageId, destinationType, destinationId, comment } = req.body;
      const io = req.app.get('io');

      const result = await forwardMessage({
        userId,
        isSuperAdmin: req.user!.isSuperAdmin,
        authorName: req.user!.displayName,
        messageId,
        destinationType,
        destinationId,
        comment,
        io,
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
