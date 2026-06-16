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
import { verifyAccessToken, cleanupExpiredTokens } from './utils/jwt';
import { canAccessProgram, canAccessChannel, canAccessConversation } from './utils/access';
import {
  initSocketPresence,
  registerSocketUser,
  unregisterSocketUser,
  getSocketUser,
  userHasOtherSockets,
} from './utils/socketPresence';
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
initSocketPresence(io);

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

// Health check — always returns 200 if the HTTP server is alive, and
// reports database connectivity separately so a DB outage doesn't take
// the whole service down (which would surface as a 502 to clients).
app.get('/health', async (req, res) => {
  let database = 'disconnected';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch {
    database = 'disconnected';
  }

  res.json({
    status: 'ok',
    database,
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

// Cache user profile info for typing indicators (avoid DB lookups on every keystroke)
const userProfileCache = new Map<string, { displayName: string; avatarUrl: string | null }>();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User authentication — a valid access token is REQUIRED. We do not accept
  // raw user IDs; an unverifiable token disconnects the socket so it cannot
  // join any rooms or be marked online.
  socket.on('authenticate', async (token: string) => {
    let userId: string;
    try {
      const payload = verifyAccessToken(token);
      userId = payload.userId;
    } catch {
      console.warn(`Socket ${socket.id} failed authentication — disconnecting`);
      socket.emit('auth_error', { message: 'Invalid or expired token' });
      socket.disconnect(true);
      return;
    }

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} authenticated as user ${userId}`);
    
    // Mark user as online and broadcast presence
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true, lastSeenAt: new Date() },
        select: { id: true, displayName: true, avatarUrl: true, isSuperAdmin: true },
      });

      // Record auth only after we've confirmed the user exists in the DB.
      registerSocketUser(socket.id, { userId, isSuperAdmin: user.isSuperAdmin });
      console.log(`User ${userId} marked online via socket`);

      // Tell the client auth succeeded so it can (re-)join rooms only AFTER the
      // server knows who it is — room-join authorization depends on the socket
      // presence map being populated, so clients must not join until this ack arrives.
      socket.emit('authenticated', { userId });
      
      // Cache profile for typing indicators (avoids DB lookups on every keystroke)
      userProfileCache.set(userId, { displayName: user.displayName, avatarUrl: user.avatarUrl });
      
      // Get all programs the user is a member of to broadcast presence
      const memberships = await prisma.programMembership.findMany({
        where: { userId },
        select: { programId: true },
      });
      
      // Broadcast user:online to all programs
      memberships.forEach(m => {
        io.to(`program:${m.programId}`).emit('user:online', {
          userId: user.id,
          displayName: user.displayName,
        });
      });
      
      // Also broadcast to all DM conversation partners
      const conversations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversation: { select: { participants: { select: { userId: true } } } } },
      });
      const dmPartnerIds = new Set<string>();
      conversations.forEach(cp => {
        cp.conversation.participants.forEach(p => {
          if (p.userId !== userId) dmPartnerIds.add(p.userId);
        });
      });
      dmPartnerIds.forEach(partnerId => {
        io.to(`user:${partnerId}`).emit('user:online', {
          userId: user.id,
          displayName: user.displayName,
        });
      });
    } catch (error) {
      console.error(`Failed to mark user online:`, error);
    }
  });

  // Join program room — only if the socket is authenticated AND the user is a
  // member of the program. Leaving never needs authorization.
  socket.on('join_program', async (programId: string) => {
    const auth = getSocketUser(socket.id);
    if (!auth) return;
    if (!(await canAccessProgram(auth.userId, programId, auth.isSuperAdmin))) {
      console.warn(`Socket ${socket.id} denied join program:${programId}`);
      return;
    }
    socket.join(`program:${programId}`);
    console.log(`Socket ${socket.id} joined program:${programId}`);
  });

  // Leave program room
  socket.on('leave_program', (programId: string) => {
    socket.leave(`program:${programId}`);
    console.log(`Socket ${socket.id} left program:${programId}`);
  });

  // Join channel room — requires membership + (for private channels) access.
  socket.on('join_channel', async (channelId: string) => {
    const auth = getSocketUser(socket.id);
    if (!auth) return;
    if (!(await canAccessChannel(auth.userId, channelId, auth.isSuperAdmin))) {
      console.warn(`Socket ${socket.id} denied join channel:${channelId}`);
      return;
    }
    socket.join(`channel:${channelId}`);
    console.log(`Socket ${socket.id} joined channel:${channelId}`);
  });

  // Leave channel room
  socket.on('leave_channel', (channelId: string) => {
    socket.leave(`channel:${channelId}`);
    console.log(`Socket ${socket.id} left channel:${channelId}`);
  });

  // Join conversation (DM) room — requires being a participant.
  socket.on('join_conversation', async (conversationId: string) => {
    const auth = getSocketUser(socket.id);
    if (!auth) return;
    if (!(await canAccessConversation(auth.userId, conversationId))) {
      console.warn(`Socket ${socket.id} denied join conversation:${conversationId}`);
      return;
    }
    socket.join(`conversation:${conversationId}`);
    console.log(`Socket ${socket.id} joined conversation:${conversationId}`);
  });

  // Leave conversation room
  socket.on('leave_conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
    console.log(`Socket ${socket.id} left conversation:${conversationId}`);
  });

  // Typing indicators — use server-known userId, enrich with cached profile
  socket.on('typing_start', (data: { channelId?: string; conversationId?: string; userId: string }) => {
    const auth = getSocketUser(socket.id);
    if (!auth) return;
    const room = data.channelId ? `channel:${data.channelId}` : `conversation:${data.conversationId}`;
    const profile = userProfileCache.get(auth.userId);
    socket.to(room).emit('user_typing', {
      ...data,
      userId: auth.userId,
      displayName: profile?.displayName || 'Someone',
      avatarUrl: profile?.avatarUrl || null,
    });
  });

  socket.on('typing_stop', (data: { channelId?: string; conversationId?: string; userId: string }) => {
    const auth = getSocketUser(socket.id);
    if (!auth) return;
    const room = data.channelId ? `channel:${data.channelId}` : `conversation:${data.conversationId}`;
    const profile = userProfileCache.get(auth.userId);
    socket.to(room).emit('user_stopped_typing', {
      ...data,
      userId: auth.userId,
      displayName: profile?.displayName || 'Someone',
      avatarUrl: profile?.avatarUrl || null,
    });
  });

  // Handle disconnect - mark user offline (handles force-quit, network loss, etc.)
  socket.on('disconnect', async () => {
    const auth = getSocketUser(socket.id);
    const userId = auth?.userId;
    console.log(`Socket disconnected: ${socket.id} (user: ${userId || 'unknown'})`);
    
    if (userId) {
      unregisterSocketUser(socket.id);
      
      // Check if user has any other active sockets (multiple devices)
      const hasOtherSockets = userHasOtherSockets(userId);
      
      if (!hasOtherSockets) {
        // Clean up profile cache since no more active sockets
        userProfileCache.delete(userId);
        // No other connections - mark user offline after short delay
        // (to handle brief disconnections during network switches)
        setTimeout(async () => {
          // Double-check no new connection was made
          const stillNoSockets = !userHasOtherSockets(userId);
          if (stillNoSockets) {
            try {
              await prisma.user.update({
                where: { id: userId },
                data: { isOnline: false, lastSeenAt: new Date() },
              });
              console.log(`User ${userId} marked offline (socket disconnected)`);
              
              // Get all programs the user is a member of to broadcast presence
              const memberships = await prisma.programMembership.findMany({
                where: { userId },
                select: { programId: true },
              });
              
              // Broadcast user:offline to all programs
              memberships.forEach(m => {
                io.to(`program:${m.programId}`).emit('user:offline', {
                  userId,
                });
              });
              
              // Also broadcast to all DM conversation partners
              const conversations = await prisma.conversationParticipant.findMany({
                where: { userId },
                select: { conversation: { select: { participants: { select: { userId: true } } } } },
              });
              const dmPartnerIds = new Set<string>();
              conversations.forEach(cp => {
                cp.conversation.participants.forEach(p => {
                  if (p.userId !== userId) dmPartnerIds.add(p.userId);
                });
              });
              dmPartnerIds.forEach(partnerId => {
                io.to(`user:${partnerId}`).emit('user:offline', {
                  userId,
                });
              });
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

// Attempt to connect to the database, retrying in the background instead of
// crashing. This keeps the HTTP server (and /health) available even when the
// database is temporarily unreachable (e.g. a paused/restoring Supabase project).
const connectDatabaseWithRetry = async (retryDelayMs = 10000): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error(
      `❌ Database connection failed, retrying in ${retryDelayMs / 1000}s:`,
      error instanceof Error ? error.message : error
    );
    setTimeout(() => {
      void connectDatabaseWithRetry(retryDelayMs);
    }, retryDelayMs);
  }
};

// Periodically purge expired refresh-token rows so they don't accumulate
// forever (INF-03). Runs once on startup and then every 24h. Overlapping runs
// are skipped, errors are caught/logged so a failure can't crash the process,
// and the timer is unref'd so it never keeps the process alive during shutdown.
const TOKEN_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const scheduleTokenCleanup = (): void => {
  let cleanupInFlight = false;

  const runCleanup = async (): Promise<void> => {
    if (cleanupInFlight) {
      console.warn('Skipping expired-token cleanup — previous run still in flight');
      return;
    }
    cleanupInFlight = true;
    try {
      const deleted = await cleanupExpiredTokens();
      console.log(`🧹 Expired-token cleanup removed ${deleted} row(s)`);
    } catch (error) {
      console.error('Expired-token cleanup failed:', error instanceof Error ? error.message : error);
    } finally {
      cleanupInFlight = false;
    }
  };

  // Run once on startup, then on a recurring interval.
  void runCleanup();
  const interval = setInterval(() => {
    void runCleanup();
  }, TOKEN_CLEANUP_INTERVAL_MS);
  interval.unref();
};

const startServer = async () => {
  // Start the HTTP server immediately so the service stays up and can serve
  // /health even if the database isn't reachable yet.
  httpServer.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);
    console.log(`📡 Socket.io ready`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
  });

  // Connect to the database (non-blocking, retries on failure).
  void connectDatabaseWithRetry();

  // Schedule periodic cleanup of expired refresh tokens (INF-03).
  scheduleTokenCleanup();
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
