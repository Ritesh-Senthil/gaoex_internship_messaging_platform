/**
 * Socket.io Client for Real-time Messaging
 */

import { io, Socket } from 'socket.io-client';
import { API_CONFIG } from '../constants/config';
import { Message, DMMessage } from '../types';
import { useConnectionStore } from '../store/connectionStore';
import { getAccessToken, refreshAccessToken } from './api';

let socket: Socket | null = null;
let authenticatedUserId: string | null = null;

// Track joined rooms so we can re-join after reconnect
const joinedChannels = new Set<string>();
const joinedConversations = new Set<string>();
const joinedPrograms = new Set<string>();

// Guard against an auth_error → refresh → reconnect → auth_error loop when a
// refreshed token is still somehow rejected (e.g. clock skew). Resets after a
// quiet window.
let authErrorRetries = 0;
let lastAuthErrorAt = 0;
const AUTH_ERROR_WINDOW_MS = 30_000;
const MAX_AUTH_ERROR_RETRIES = 2;

let onAuthExhausted: (() => void) | null = null;

/** Register callback for when socket auth recovery is exhausted (authStore wires logout). */
export function setOnAuthExhausted(callback: () => void): void {
  onAuthExhausted = callback;
}

/**
 * Emit `authenticate` with the freshest token we have. If the in-memory token
 * is missing, try a refresh first so we never send a non-token value (the
 * server now rejects anything that isn't a valid JWT).
 */
async function emitAuthenticate(): Promise<void> {
  if (!authenticatedUserId) return;
  let token = getAccessToken();
  if (!token) {
    token = await refreshAccessToken();
  }
  if (token) {
    socket?.emit('authenticate', token);
  }
}

/**
 * Re-join every room we were tracking. Called once the server acks
 * authentication, since room-join authorization requires the socket to be
 * authenticated first.
 */
function rejoinTrackedRooms(): void {
  joinedPrograms.forEach((id) => socket?.emit('join_program', id));
  joinedChannels.forEach((id) => socket?.emit('join_channel', id));
  joinedConversations.forEach((id) => socket?.emit('join_conversation', id));
}

/**
 * Initialize socket connection
 */
export function initializeSocket(): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io(API_CONFIG.SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    // TCP is up but we're not authenticated yet — wait for `authenticated`.
    useConnectionStore.getState().setConnecting();
    void emitAuthenticate();
  });

  // Server confirmed our identity — now realtime is actually usable.
  socket.on('authenticated', () => {
    authErrorRetries = 0;
    useConnectionStore.getState().setConnected();
    rejoinTrackedRooms();
  });

  // Server rejected our token (usually expired). Refresh once and reconnect;
  // because the server force-disconnects us, auto-reconnect won't fire, so we
  // reconnect explicitly.
  socket.on('auth_error', async () => {
    if (!authenticatedUserId) return;

    const now = Date.now();
    if (now - lastAuthErrorAt > AUTH_ERROR_WINDOW_MS) authErrorRetries = 0;
    lastAuthErrorAt = now;
    authErrorRetries += 1;
    if (authErrorRetries > MAX_AUTH_ERROR_RETRIES) {
      // Refreshing isn't helping; force the same logout path as REST 401.
      useConnectionStore.getState().setDisconnected();
      if (onAuthExhausted) onAuthExhausted();
      return;
    }

    const token = await refreshAccessToken();
    if (!token) return; // refresh failed → tokens cleared + logout callback fired

    if (socket && !socket.connected) {
      socket.connect(); // 'connect' → emitAuthenticate → 'authenticated' → rejoin
    } else {
      void emitAuthenticate();
    }
  });

  socket.on('disconnect', () => {
    useConnectionStore.getState().setDisconnected();
  });

  socket.on('connect_error', () => {
    useConnectionStore.getState().setDisconnected();
  });

  socket.io.on('reconnect_attempt', () => {
    useConnectionStore.getState().setConnecting();
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
    void emitAuthenticate();
  }
  // If not yet connected, the 'connect' handler will authenticate on connect.
}

/**
 * Clear socket authentication (on logout)
 */
export function clearSocketAuth(): void {
  authenticatedUserId = null;
  authErrorRetries = 0;
  lastAuthErrorAt = 0;
  joinedChannels.clear();
  joinedConversations.clear();
  joinedPrograms.clear();
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
  joinedChannels.clear();
  joinedConversations.clear();
  joinedPrograms.clear();
}

/**
 * Join a channel room for real-time updates
 */
export function joinChannel(channelId: string): void {
  joinedChannels.add(channelId);
  const s = getSocket();
  s.emit('join_channel', channelId);
}

/**
 * Leave a channel room
 */
export function leaveChannel(channelId: string): void {
  joinedChannels.delete(channelId);
  const s = getSocket();
  s.emit('leave_channel', channelId);
}

/**
 * Join a program room
 */
export function joinProgram(programId: string): void {
  joinedPrograms.add(programId);
  const s = getSocket();
  s.emit('join_program', programId);
}

/**
 * Leave a program room
 */
export function leaveProgram(programId: string): void {
  joinedPrograms.delete(programId);
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

// Thread reply event data
export interface ThreadReplyAddedData {
  parentMessageId: string;
  replyCount: number;
  lastReplyAt: string;
  latestReplyAuthors: { id: string; displayName: string; avatarUrl: string | null }[];
}

// Pin event data
export interface MessagePinnedData {
  channelId?: string;
  conversationId?: string;
  message: Message | DMMessage;
  pinnedBy: { id: string; displayName: string };
}

export interface MessageUnpinnedData {
  channelId?: string;
  conversationId?: string;
  messageId: string;
  unpinnedBy: { id: string; displayName: string };
}

// Channel typing payload (enriched with profile info from the server, mirrors TypingEventData but keyed by channel)
export interface ChannelTypingEventData {
  channelId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

// Event listener types
export interface SocketEventHandlers {
  onNewMessage?: (message: Message) => void;
  onMessageUpdated?: (message: Message) => void;
  onMessageDeleted?: (data: { messageId: string; channelId: string; parentMessageId?: string | null }) => void;
  onUserTyping?: (data: ChannelTypingEventData) => void;
  onUserStoppedTyping?: (data: ChannelTypingEventData) => void;
  onReactionAdded?: (data: ReactionEventData) => void;
  onReactionRemoved?: (data: ReactionEventData) => void;
  onThreadReplyAdded?: (data: ThreadReplyAddedData) => void;
  onMessagePinned?: (data: MessagePinnedData) => void;
  onMessageUnpinned?: (data: MessageUnpinnedData) => void;
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
  if (handlers.onThreadReplyAdded) {
    s.on('thread:reply_added', handlers.onThreadReplyAdded);
  }
  if (handlers.onMessagePinned) {
    s.on('message_pinned', handlers.onMessagePinned);
  }
  if (handlers.onMessageUnpinned) {
    s.on('message_unpinned', handlers.onMessageUnpinned);
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
    if (handlers.onThreadReplyAdded) {
      s.off('thread:reply_added', handlers.onThreadReplyAdded);
    }
    if (handlers.onMessagePinned) {
      s.off('message_pinned', handlers.onMessagePinned);
    }
    if (handlers.onMessageUnpinned) {
      s.off('message_unpinned', handlers.onMessageUnpinned);
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
  joinedConversations.add(conversationId);
  const s = getSocket();
  s.emit('join_conversation', conversationId);
}

/**
 * Leave a conversation room
 */
export function leaveConversation(conversationId: string): void {
  joinedConversations.delete(conversationId);
  const s = getSocket();
  s.emit('leave_conversation', conversationId);
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

// Typing indicator data (enriched with profile info from server)
export interface TypingEventData {
  conversationId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

// DM Event listener types
export interface DMSocketEventHandlers {
  onNewDMMessage?: (data: { conversationId: string; message: DMMessage }) => void;
  onDMMessageUpdated?: (data: { conversationId: string; message: DMMessage }) => void;
  onDMMessageDeleted?: (data: { conversationId: string; messageId: string; parentMessageId?: string | null }) => void;
  onUserTyping?: (data: TypingEventData) => void;
  onUserStoppedTyping?: (data: TypingEventData) => void;
  onReactionAdded?: (data: ReactionEventData) => void;
  onReactionRemoved?: (data: ReactionEventData) => void;
  onThreadReplyAdded?: (data: ThreadReplyAddedData) => void;
  onMessagePinned?: (data: MessagePinnedData) => void;
  onMessageUnpinned?: (data: MessageUnpinnedData) => void;
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
  if (handlers.onThreadReplyAdded) {
    s.on('thread:reply_added', handlers.onThreadReplyAdded);
  }
  if (handlers.onMessagePinned) {
    s.on('message_pinned', handlers.onMessagePinned);
  }
  if (handlers.onMessageUnpinned) {
    s.on('message_unpinned', handlers.onMessageUnpinned);
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
    if (handlers.onThreadReplyAdded) {
      s.off('thread:reply_added', handlers.onThreadReplyAdded);
    }
    if (handlers.onMessagePinned) {
      s.off('message_pinned', handlers.onMessagePinned);
    }
    if (handlers.onMessageUnpinned) {
      s.off('message_unpinned', handlers.onMessageUnpinned);
    }
  };
}

// ============================================
// UNREAD EVENTS
// ============================================

// Unread event data types
export interface UnreadChannelEventData {
  channelId: string;
  programId: string;
  authorId: string;
}

export interface UnreadDMEventData {
  conversationId: string;
  recipientUserId: string;
  senderId: string;
}

export interface UnreadMentionEventData {
  channelId: string;
  programId: string;
  mentionedUserIds: string[];
}

// Unread event handler types
export interface UnreadEventHandlers {
  onUnreadChannel?: (data: UnreadChannelEventData) => void;
  onUnreadDM?: (data: UnreadDMEventData) => void;
  onUnreadMention?: (data: UnreadMentionEventData) => void;
}

/**
 * Subscribe to unread events (global - not specific to a channel/conversation)
 */
export function subscribeToUnreadEvents(handlers: UnreadEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onUnreadChannel) {
    s.on('unread:channel', handlers.onUnreadChannel);
  }
  if (handlers.onUnreadDM) {
    s.on('unread:dm', handlers.onUnreadDM);
  }
  if (handlers.onUnreadMention) {
    s.on('unread:mention', handlers.onUnreadMention);
  }

  // Return cleanup function
  return () => {
    if (handlers.onUnreadChannel) {
      s.off('unread:channel', handlers.onUnreadChannel);
    }
    if (handlers.onUnreadDM) {
      s.off('unread:dm', handlers.onUnreadDM);
    }
    if (handlers.onUnreadMention) {
      s.off('unread:mention', handlers.onUnreadMention);
    }
  };
}

// ============================================
// CHANNEL & CATEGORY EVENTS
// ============================================

import { Channel, Category } from '../types';

// Channel event data types
export interface ChannelEventData {
  programId: string;
  channel: Channel;
}

export interface ChannelDeletedEventData {
  programId: string;
  channelId: string;
}

export interface ChannelMovedEventData {
  programId: string;
  channelId: string;
  fromCategoryId: string | null;
  toCategoryId: string | null;
}

// Category event data types
export interface CategoryEventData {
  programId: string;
  category: Category;
}

export interface CategoryDeletedEventData {
  programId: string;
  categoryId: string;
}

// Channel/Category event handler types
export interface ChannelCategoryEventHandlers {
  onChannelCreated?: (data: ChannelEventData) => void;
  onChannelUpdated?: (data: ChannelEventData) => void;
  onChannelDeleted?: (data: ChannelDeletedEventData) => void;
  onChannelMoved?: (data: ChannelMovedEventData) => void;
  onCategoryCreated?: (data: CategoryEventData) => void;
  onCategoryUpdated?: (data: CategoryEventData) => void;
  onCategoryDeleted?: (data: CategoryDeletedEventData) => void;
}

/**
 * Subscribe to channel and category events (program-wide)
 */
export function subscribeToChannelCategoryEvents(handlers: ChannelCategoryEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onChannelCreated) {
    s.on('channel:created', handlers.onChannelCreated);
  }
  if (handlers.onChannelUpdated) {
    s.on('channel:updated', handlers.onChannelUpdated);
  }
  if (handlers.onChannelDeleted) {
    s.on('channel:deleted', handlers.onChannelDeleted);
  }
  if (handlers.onChannelMoved) {
    s.on('channel:moved', handlers.onChannelMoved);
  }
  if (handlers.onCategoryCreated) {
    s.on('category:created', handlers.onCategoryCreated);
  }
  if (handlers.onCategoryUpdated) {
    s.on('category:updated', handlers.onCategoryUpdated);
  }
  if (handlers.onCategoryDeleted) {
    s.on('category:deleted', handlers.onCategoryDeleted);
  }

  // Return cleanup function
  return () => {
    if (handlers.onChannelCreated) {
      s.off('channel:created', handlers.onChannelCreated);
    }
    if (handlers.onChannelUpdated) {
      s.off('channel:updated', handlers.onChannelUpdated);
    }
    if (handlers.onChannelDeleted) {
      s.off('channel:deleted', handlers.onChannelDeleted);
    }
    if (handlers.onChannelMoved) {
      s.off('channel:moved', handlers.onChannelMoved);
    }
    if (handlers.onCategoryCreated) {
      s.off('category:created', handlers.onCategoryCreated);
    }
    if (handlers.onCategoryUpdated) {
      s.off('category:updated', handlers.onCategoryUpdated);
    }
    if (handlers.onCategoryDeleted) {
      s.off('category:deleted', handlers.onCategoryDeleted);
    }
  };
}

// ============================================
// MEMBER & ROLE EVENTS
// ============================================

// Member event data types
export interface MemberEventData {
  programId: string;
  member: {
    id: string;
    userId: string;
    displayName: string;
    avatarUrl?: string | null;
    nickname?: string | null;
    roles: Array<{
      id: string;
      name: string;
      color?: string | null;
      tier: number;
    }>;
    joinedAt: string;
  };
}

export interface MemberRoleChangedEventData {
  programId: string;
  userId: string;
  roles: Array<{
    id: string;
    name: string;
    color?: string | null;
    tier: number;
  }>;
}

// Role event data types
export interface RoleEventData {
  programId: string;
  role: {
    id: string;
    name: string;
    color?: string | null;
    tier: number;
    permissions: string;
    memberCount?: number;
  };
}

export interface RoleDeletedEventData {
  programId: string;
  roleId: string;
}

// Member/Role event handler types
export interface MemberRoleEventHandlers {
  onMemberJoined?: (data: MemberEventData) => void;
  onMemberRoleChanged?: (data: MemberRoleChangedEventData) => void;
  onRoleCreated?: (data: RoleEventData) => void;
  onRoleUpdated?: (data: RoleEventData) => void;
  onRoleDeleted?: (data: RoleDeletedEventData) => void;
}

/**
 * Subscribe to member and role events (program-wide)
 */
export function subscribeToMemberRoleEvents(handlers: MemberRoleEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onMemberJoined) {
    s.on('member:joined', handlers.onMemberJoined);
  }
  if (handlers.onMemberRoleChanged) {
    s.on('member:role_changed', handlers.onMemberRoleChanged);
  }
  if (handlers.onRoleCreated) {
    s.on('role:created', handlers.onRoleCreated);
  }
  if (handlers.onRoleUpdated) {
    s.on('role:updated', handlers.onRoleUpdated);
  }
  if (handlers.onRoleDeleted) {
    s.on('role:deleted', handlers.onRoleDeleted);
  }

  // Return cleanup function
  return () => {
    if (handlers.onMemberJoined) {
      s.off('member:joined', handlers.onMemberJoined);
    }
    if (handlers.onMemberRoleChanged) {
      s.off('member:role_changed', handlers.onMemberRoleChanged);
    }
    if (handlers.onRoleCreated) {
      s.off('role:created', handlers.onRoleCreated);
    }
    if (handlers.onRoleUpdated) {
      s.off('role:updated', handlers.onRoleUpdated);
    }
    if (handlers.onRoleDeleted) {
      s.off('role:deleted', handlers.onRoleDeleted);
    }
  };
}

// ============================================
// PRESENCE & PROFILE EVENTS
// ============================================

// Presence event data types
export interface UserOnlineEventData {
  userId: string;
  displayName: string;
}

export interface UserOfflineEventData {
  userId: string;
}

export interface UserProfileUpdatedEventData {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  bannerColor?: string;
  statusEmoji?: string | null;
  statusText?: string | null;
  statusExpiresAt?: string | null;
}

// Presence event handler types
export interface PresenceEventHandlers {
  onUserOnline?: (data: UserOnlineEventData) => void;
  onUserOffline?: (data: UserOfflineEventData) => void;
  onUserProfileUpdated?: (data: UserProfileUpdatedEventData) => void;
}

/**
 * Subscribe to presence and profile events (app-wide)
 */
export function subscribeToPresenceEvents(handlers: PresenceEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onUserOnline) {
    s.on('user:online', handlers.onUserOnline);
  }
  if (handlers.onUserOffline) {
    s.on('user:offline', handlers.onUserOffline);
  }
  if (handlers.onUserProfileUpdated) {
    s.on('user:profile_updated', handlers.onUserProfileUpdated);
  }

  // Return cleanup function
  return () => {
    if (handlers.onUserOnline) {
      s.off('user:online', handlers.onUserOnline);
    }
    if (handlers.onUserOffline) {
      s.off('user:offline', handlers.onUserOffline);
    }
    if (handlers.onUserProfileUpdated) {
      s.off('user:profile_updated', handlers.onUserProfileUpdated);
    }
  };
}

// ============================================
// PROGRAM EVENTS
// ============================================

// Program event data types
export interface ProgramUpdatedEventData {
  programId: string;
  name?: string;
  description?: string;
  iconUrl?: string | null;
  isPrivate?: boolean;
}

export interface ProgramDeletedEventData {
  programId: string;
}

// Program event handler types
export interface ProgramEventHandlers {
  onProgramUpdated?: (data: ProgramUpdatedEventData) => void;
  onProgramDeleted?: (data: ProgramDeletedEventData) => void;
}

/**
 * Subscribe to program-level events
 */
export function subscribeToProgramEvents(handlers: ProgramEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onProgramUpdated) {
    s.on('program:updated', handlers.onProgramUpdated);
  }
  if (handlers.onProgramDeleted) {
    s.on('program:deleted', handlers.onProgramDeleted);
  }

  // Return cleanup function
  return () => {
    if (handlers.onProgramUpdated) {
      s.off('program:updated', handlers.onProgramUpdated);
    }
    if (handlers.onProgramDeleted) {
      s.off('program:deleted', handlers.onProgramDeleted);
    }
  };
}

// ============================================
// GROUP DM EVENTS
// ============================================

export interface GroupCreatedEventData {
  conversation: {
    id: string;
    isGroup: boolean;
    groupName?: string | null;
    name: string;
    createdById?: string | null;
    participants: { userId: string; displayName: string; avatarUrl: string | null; isOnline: boolean }[];
  };
}

export interface GroupUpdatedEventData {
  conversationId: string;
  name: string | null;
  displayName: string;
  updatedBy: string;
}

export interface GroupParticipantAddedEventData {
  conversationId: string;
  addedUsers: { userId: string; displayName: string; avatarUrl: string | null; isOnline: boolean }[];
  addedBy: string;
}

export interface GroupParticipantLeftEventData {
  conversationId: string;
  userId: string;
  displayName: string;
  remainingCount: number;
}

export interface GroupEventHandlers {
  onGroupCreated?: (data: GroupCreatedEventData) => void;
  onGroupUpdated?: (data: GroupUpdatedEventData) => void;
  onGroupParticipantAdded?: (data: GroupParticipantAddedEventData) => void;
  onGroupParticipantLeft?: (data: GroupParticipantLeftEventData) => void;
}

/**
 * Subscribe to group DM events (fired via user:{userId} personal room)
 */
export function subscribeToGroupEvents(handlers: GroupEventHandlers): () => void {
  const s = getSocket();

  if (handlers.onGroupCreated) {
    s.on('group:created', handlers.onGroupCreated);
  }
  if (handlers.onGroupUpdated) {
    s.on('group:updated', handlers.onGroupUpdated);
  }
  if (handlers.onGroupParticipantAdded) {
    s.on('group:participant_added', handlers.onGroupParticipantAdded);
  }
  if (handlers.onGroupParticipantLeft) {
    s.on('group:participant_left', handlers.onGroupParticipantLeft);
  }

  return () => {
    if (handlers.onGroupCreated) {
      s.off('group:created', handlers.onGroupCreated);
    }
    if (handlers.onGroupUpdated) {
      s.off('group:updated', handlers.onGroupUpdated);
    }
    if (handlers.onGroupParticipantAdded) {
      s.off('group:participant_added', handlers.onGroupParticipantAdded);
    }
    if (handlers.onGroupParticipantLeft) {
      s.off('group:participant_left', handlers.onGroupParticipantLeft);
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
  sendDMTypingStart,
  sendDMTypingStop,
  subscribeToConversationEvents,
  subscribeToUnreadEvents,
  subscribeToChannelCategoryEvents,
  subscribeToMemberRoleEvents,
  subscribeToPresenceEvents,
  subscribeToProgramEvents,
  subscribeToGroupEvents,
};
