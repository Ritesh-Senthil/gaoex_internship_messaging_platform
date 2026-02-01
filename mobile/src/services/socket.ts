/**
 * Socket.io Client for Real-time Messaging
 */

import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '../constants/config';
import { Message, DMMessage } from '../types';

let socket: Socket | null = null;
let authenticatedUserId: string | null = null;

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
    // Re-authenticate on reconnect
    if (authenticatedUserId) {
      socket?.emit('authenticate', authenticatedUserId);
    }
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
 * Authenticate socket with user ID (for online/offline tracking)
 */
export function authenticateSocket(userId: string): void {
  authenticatedUserId = userId;
  const s = getSocket();
  if (s.connected) {
    s.emit('authenticate', userId);
    console.log('Socket authenticated for user:', userId);
  }
}

/**
 * Clear socket authentication (on logout)
 */
export function clearSocketAuth(): void {
  authenticatedUserId = null;
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

// Reaction data type
export interface ReactionEventData {
  messageId: string;
  channelId?: string;
  conversationId?: string;
  emoji: string;
  user: { id: string; displayName: string };
}

// Event listener types
export interface SocketEventHandlers {
  onNewMessage?: (message: Message) => void;
  onMessageUpdated?: (message: Message) => void;
  onMessageDeleted?: (data: { messageId: string; channelId: string }) => void;
  onUserTyping?: (data: { channelId: string; userId: string }) => void;
  onUserStoppedTyping?: (data: { channelId: string; userId: string }) => void;
  onReactionAdded?: (data: ReactionEventData) => void;
  onReactionRemoved?: (data: ReactionEventData) => void;
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
  if (handlers.onReactionAdded) {
    s.on('reaction_added', handlers.onReactionAdded);
  }
  if (handlers.onReactionRemoved) {
    s.on('reaction_removed', handlers.onReactionRemoved);
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
    if (handlers.onReactionAdded) {
      s.off('reaction_added', handlers.onReactionAdded);
    }
    if (handlers.onReactionRemoved) {
      s.off('reaction_removed', handlers.onReactionRemoved);
    }
  };
}

// ============================================
// CONVERSATION (DM) EVENTS
// ============================================

/**
 * Join a conversation room for real-time updates
 */
export function joinConversation(conversationId: string): void {
  const s = getSocket();
  s.emit('join_conversation', conversationId);
}

/**
 * Leave a conversation room
 */
export function leaveConversation(conversationId: string): void {
  const s = getSocket();
  s.emit('leave_conversation', conversationId);
}

/**
 * Broadcast a DM message to other participants
 */
export function broadcastDMMessage(conversationId: string, message: DMMessage): void {
  const s = getSocket();
  s.emit('dm_message', { conversationId, message });
}

/**
 * Send typing indicator for DM
 */
export function sendDMTypingStart(conversationId: string, userId: string): void {
  const s = getSocket();
  s.emit('typing_start', { conversationId, userId });
}

/**
 * Stop typing indicator for DM
 */
export function sendDMTypingStop(conversationId: string, userId: string): void {
  const s = getSocket();
  s.emit('typing_stop', { conversationId, userId });
}

// DM Event listener types
export interface DMSocketEventHandlers {
  onNewDMMessage?: (data: { conversationId: string; message: DMMessage }) => void;
  onDMMessageUpdated?: (data: { conversationId: string; message: DMMessage }) => void;
  onDMMessageDeleted?: (data: { conversationId: string; messageId: string }) => void;
  onUserTyping?: (data: { conversationId: string; userId: string }) => void;
  onUserStoppedTyping?: (data: { conversationId: string; userId: string }) => void;
  onReactionAdded?: (data: ReactionEventData) => void;
  onReactionRemoved?: (data: ReactionEventData) => void;
}

/**
 * Subscribe to DM events
 */
export function subscribeToConversationEvents(handlers: DMSocketEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onNewDMMessage) {
    s.on('new_dm_message', handlers.onNewDMMessage);
  }
  if (handlers.onDMMessageUpdated) {
    s.on('dm_message_updated', handlers.onDMMessageUpdated);
  }
  if (handlers.onDMMessageDeleted) {
    s.on('dm_message_deleted', handlers.onDMMessageDeleted);
  }
  if (handlers.onUserTyping) {
    s.on('user_typing', handlers.onUserTyping);
  }
  if (handlers.onUserStoppedTyping) {
    s.on('user_stopped_typing', handlers.onUserStoppedTyping);
  }
  if (handlers.onReactionAdded) {
    s.on('reaction_added', handlers.onReactionAdded);
  }
  if (handlers.onReactionRemoved) {
    s.on('reaction_removed', handlers.onReactionRemoved);
  }

  // Return cleanup function
  return () => {
    if (handlers.onNewDMMessage) {
      s.off('new_dm_message', handlers.onNewDMMessage);
    }
    if (handlers.onDMMessageUpdated) {
      s.off('dm_message_updated', handlers.onDMMessageUpdated);
    }
    if (handlers.onDMMessageDeleted) {
      s.off('dm_message_deleted', handlers.onDMMessageDeleted);
    }
    if (handlers.onUserTyping) {
      s.off('user_typing', handlers.onUserTyping);
    }
    if (handlers.onUserStoppedTyping) {
      s.off('user_stopped_typing', handlers.onUserStoppedTyping);
    }
    if (handlers.onReactionAdded) {
      s.off('reaction_added', handlers.onReactionAdded);
    }
    if (handlers.onReactionRemoved) {
      s.off('reaction_removed', handlers.onReactionRemoved);
    }
  };
}

export default {
  initializeSocket,
  getSocket,
  disconnectSocket,
  authenticateSocket,
  clearSocketAuth,
  joinChannel,
  leaveChannel,
  joinProgram,
  leaveProgram,
  sendTypingStart,
  sendTypingStop,
  subscribeToChannelEvents,
  joinConversation,
  leaveConversation,
  broadcastDMMessage,
  sendDMTypingStart,
  sendDMTypingStop,
  subscribeToConversationEvents,
};
