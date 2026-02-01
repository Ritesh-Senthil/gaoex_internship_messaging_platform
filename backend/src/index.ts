import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { config, validateConfig } from './config';
import { prisma, disconnectDatabase } from './config/database';
import { initializeFirebase } from './config/firebase';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import routes from './routes';

// Validate configuration
validateConfig();

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  console.warn('Firebase initialization skipped (credentials may not be configured)');
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Store io instance for use in routes
app.set('io', io);

// ===================
// Middleware
// ===================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// ===================
// Routes
// ===================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API routes
app.use('/api', routes);

// ===================
// Error Handling
// ===================

app.use(notFoundHandler);
app.use(errorHandler);

// ===================
// Socket.io Events
// ===================

// Track socket -> userId mapping for disconnect handling
const socketUserMap = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User authentication - associate socket with user
  socket.on('authenticate', async (userId: string) => {
    socketUserMap.set(socket.id, userId);
    console.log(`Socket ${socket.id} authenticated as user ${userId}`);
    
    // Mark user as online
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      });
      console.log(`User ${userId} marked online via socket`);
    } catch (error) {
      console.error(`Failed to mark user online:`, error);
    }
  });

  // Join program room
  socket.on('join_program', (programId: string) => {
    socket.join(`program:${programId}`);
    console.log(`Socket ${socket.id} joined program:${programId}`);
  });

  // Leave program room
  socket.on('leave_program', (programId: string) => {
    socket.leave(`program:${programId}`);
    console.log(`Socket ${socket.id} left program:${programId}`);
  });

  // Join channel room
  socket.on('join_channel', (channelId: string) => {
    socket.join(`channel:${channelId}`);
    console.log(`Socket ${socket.id} joined channel:${channelId}`);
  });

  // Leave channel room
  socket.on('leave_channel', (channelId: string) => {
    socket.leave(`channel:${channelId}`);
    console.log(`Socket ${socket.id} left channel:${channelId}`);
  });

  // Typing indicators
  socket.on('typing_start', (data: { channelId?: string; conversationId?: string; userId: string }) => {
    const room = data.channelId ? `channel:${data.channelId}` : `conversation:${data.conversationId}`;
    socket.to(room).emit('user_typing', data);
  });

  socket.on('typing_stop', (data: { channelId?: string; conversationId?: string; userId: string }) => {
    const room = data.channelId ? `channel:${data.channelId}` : `conversation:${data.conversationId}`;
    socket.to(room).emit('user_stopped_typing', data);
  });

  // Handle disconnect - mark user offline (handles force-quit, network loss, etc.)
  socket.on('disconnect', async () => {
    const userId = socketUserMap.get(socket.id);
    console.log(`Socket disconnected: ${socket.id} (user: ${userId || 'unknown'})`);
    
    if (userId) {
      socketUserMap.delete(socket.id);
      
      // Check if user has any other active sockets (multiple devices)
      const hasOtherSockets = Array.from(socketUserMap.values()).includes(userId);
      
      if (!hasOtherSockets) {
        // No other connections - mark user offline after short delay
        // (to handle brief disconnections during network switches)
        setTimeout(async () => {
          // Double-check no new connection was made
          const stillNoSockets = !Array.from(socketUserMap.values()).includes(userId);
          if (stillNoSockets) {
            try {
              await prisma.user.update({
                where: { id: userId },
                data: { isOnline: false, lastSeenAt: new Date() },
              });
              console.log(`User ${userId} marked offline (socket disconnected)`);
            } catch (error) {
              console.error(`Failed to mark user offline:`, error);
            }
          }
        }, 5000); // 5 second grace period
      }
    }
  });
});

// ===================
// Start Server
// ===================

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log(`🚀 Server running on http://localhost:${config.port}`);
      console.log(`📡 Socket.io ready`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  await disconnectDatabase();
  console.log('Database disconnected');
  
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
startServer();

export { app, io };
