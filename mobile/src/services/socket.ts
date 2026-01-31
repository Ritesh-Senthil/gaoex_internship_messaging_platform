/**
 * Socket.io Client for Real-time Messaging
 */

import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '../constants/config';
import { Message } from '../types';

let socket: Socket | null = null;

/**
 * Initialize socket connection
 */
export function initializeSocket(): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(API_CONFIG.BASE_URL.replace('/api', ''), {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socket;
}

/**
 * Get socket instance (initializes if not already)
 */
export function getSocket(): Socket {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
}

/**
 * Disconnect socket
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join a channel room for real-time updates
 */
export function joinChannel(channelId: string): void {
  const s = getSocket();
  s.emit('join_channel', channelId);
}

/**
 * Leave a channel room
 */
export function leaveChannel(channelId: string): void {
  const s = getSocket();
  s.emit('leave_channel', channelId);
}

/**
 * Join a program room
 */
export function joinProgram(programId: string): void {
  const s = getSocket();
  s.emit('join_program', programId);
}

/**
 * Leave a program room
 */
export function leaveProgram(programId: string): void {
  const s = getSocket();
  s.emit('leave_program', programId);
}

/**
 * Send typing indicator
 */
export function sendTypingStart(channelId: string, userId: string): void {
  const s = getSocket();
  s.emit('typing_start', { channelId, userId });
}

/**
 * Stop typing indicator
 */
export function sendTypingStop(channelId: string, userId: string): void {
  const s = getSocket();
  s.emit('typing_stop', { channelId, userId });
}

// Event listener types
export interface SocketEventHandlers {
  onNewMessage?: (message: Message) => void;
  onMessageUpdated?: (message: Message) => void;
  onMessageDeleted?: (data: { messageId: string; channelId: string }) => void;
  onUserTyping?: (data: { channelId: string; userId: string }) => void;
  onUserStoppedTyping?: (data: { channelId: string; userId: string }) => void;
}

/**
 * Subscribe to channel events
 */
export function subscribeToChannelEvents(handlers: SocketEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onNewMessage) {
    s.on('new_message', handlers.onNewMessage);
  }
  if (handlers.onMessageUpdated) {
    s.on('message_updated', handlers.onMessageUpdated);
  }
  if (handlers.onMessageDeleted) {
    s.on('message_deleted', handlers.onMessageDeleted);
  }
  if (handlers.onUserTyping) {
    s.on('user_typing', handlers.onUserTyping);
  }
  if (handlers.onUserStoppedTyping) {
    s.on('user_stopped_typing', handlers.onUserStoppedTyping);
  }

  // Return cleanup function
  return () => {
    if (handlers.onNewMessage) {
      s.off('new_message', handlers.onNewMessage);
    }
    if (handlers.onMessageUpdated) {
      s.off('message_updated', handlers.onMessageUpdated);
    }
    if (handlers.onMessageDeleted) {
      s.off('message_deleted', handlers.onMessageDeleted);
    }
    if (handlers.onUserTyping) {
      s.off('user_typing', handlers.onUserTyping);
    }
    if (handlers.onUserStoppedTyping) {
      s.off('user_stopped_typing', handlers.onUserStoppedTyping);
    }
  };
}

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  joinChannel,
  leaveChannel,
  joinProgram,
  leaveProgram,
  sendTypingStart,
  sendTypingStop,
  subscribeToChannelEvents,
};
