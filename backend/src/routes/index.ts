import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import programRoutes from './program.routes';
import channelRoutes from './channel.routes';
import roleRoutes from './role.routes';
import conversationRoutes from './conversation.routes';
import reactionRoutes from './reaction.routes';

const router = Router();

// Auth routes
router.use('/auth', authRoutes);

// User routes
router.use('/users', userRoutes);

// Role routes (nested under programs) - MUST be before programRoutes to avoid /:id catching role paths
router.use('/programs', roleRoutes);

// Program routes
router.use('/programs', programRoutes);

// Channel routes
router.use('/channels', channelRoutes);

// Conversation (DM) routes
router.use('/conversations', conversationRoutes);

// Message reaction routes
router.use('/messages', reactionRoutes);

// API info
router.get('/', (req, res) => {
  res.json({
    name: 'InternHub API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      programs: '/api/programs',
      channels: '/api/channels',
      roles: '/api/programs/:programId/roles',
      conversations: '/api/conversations',
      messages: '/api/messages',
    },
  });
});

export default router;
