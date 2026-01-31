import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import programRoutes from './program.routes';
import channelRoutes from './channel.routes';

const router = Router();

// Auth routes
router.use('/auth', authRoutes);

// User routes
router.use('/users', userRoutes);

// Program routes
router.use('/programs', programRoutes);

// Channel routes
router.use('/channels', channelRoutes);

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
    },
  });
});

export default router;
