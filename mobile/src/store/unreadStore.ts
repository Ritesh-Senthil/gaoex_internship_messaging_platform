/**
 * Unread Store using Zustand
 * Manages unread state for channels and conversations across the app
 * Enables real-time updates and optimistic UI
 *
 * Persisted to AsyncStorage so unread badges survive app restarts.
 * Screens also fetch fresh data from the API on mount, so persisted
 * state serves as a fast initial render while the API provides the
 * authoritative update.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ChannelUnread {
  hasUnread: boolean;
  mentionCount: number;
}

interface UnreadState {
  // State
  channelUnreads: Record<string, ChannelUnread>; // channelId -> unread state
  conversationUnreads: Record<string, number>; // conversationId -> unread count
  
  // Actions - Channel
  setChannelUnread: (channelId: string, hasUnread: boolean, mentionCount?: number) => void;
  markChannelRead: (channelId: string) => void;
  incrementChannelUnread: (channelId: string, isMention?: boolean) => void;
  setAllChannelUnreads: (unreads: Record<string, ChannelUnread>) => void;
  
  // Actions - Conversation
  setConversationUnread: (conversationId: string, count: number) => void;
  markConversationRead: (conversationId: string) => void;
  incrementConversationUnread: (conversationId: string) => void;
  setAllConversationUnreads: (unreads: Record<string, number>) => void;
  
  // Utility
  clearAll: () => void;
}

export const useUnreadStore = create<UnreadState>()(
  persist(
    (set, get) => ({
  // Initial state
  channelUnreads: {},
  conversationUnreads: {},
  
  /**
   * Set unread state for a specific channel
   */
  setChannelUnread: (channelId: string, hasUnread: boolean, mentionCount: number = 0) => {
    set((state) => ({
      channelUnreads: {
        ...state.channelUnreads,
        [channelId]: { hasUnread, mentionCount },
      },
    }));
  },
  
  /**
   * Mark a channel as read (optimistic update)
   */
  markChannelRead: (channelId: string) => {
    set((state) => ({
      channelUnreads: {
        ...state.channelUnreads,
        [channelId]: { hasUnread: false, mentionCount: 0 },
      },
    }));
  },
  
  /**
   * Increment unread for a channel (when new message arrives)
   */
  incrementChannelUnread: (channelId: string, isMention: boolean = false) => {
    set((state) => {
      const current = state.channelUnreads[channelId] || { hasUnread: false, mentionCount: 0 };
      return {
        channelUnreads: {
          ...state.channelUnreads,
          [channelId]: {
            hasUnread: true,
            mentionCount: isMention ? current.mentionCount + 1 : current.mentionCount,
          },
        },
      };
    });
  },
  
  /**
   * Set all channel unreads at once (from API response)
   */
  setAllChannelUnreads: (unreads: Record<string, ChannelUnread>) => {
    set((state) => ({
      channelUnreads: {
        ...state.channelUnreads,
        ...unreads,
      },
    }));
  },
  
  /**
   * Set unread count for a specific conversation
   */
  setConversationUnread: (conversationId: string, count: number) => {
    set((state) => ({
      conversationUnreads: {
        ...state.conversationUnreads,
        [conversationId]: count,
      },
    }));
  },
  
  /**
   * Mark a conversation as read (optimistic update)
   */
  markConversationRead: (conversationId: string) => {
    set((state) => ({
      conversationUnreads: {
        ...state.conversationUnreads,
        [conversationId]: 0,
      },
    }));
  },
  
  /**
   * Increment unread for a conversation (when new DM arrives)
   */
  incrementConversationUnread: (conversationId: string) => {
    set((state) => {
      const current = state.conversationUnreads[conversationId] || 0;
      return {
        conversationUnreads: {
          ...state.conversationUnreads,
          [conversationId]: current + 1,
        },
      };
    });
  },
  
  /**
   * Set all conversation unreads at once (from API response)
   */
  setAllConversationUnreads: (unreads: Record<string, number>) => {
    set((state) => ({
      conversationUnreads: {
        ...state.conversationUnreads,
        ...unreads,
      },
    }));
  },
  
  /**
   * Clear all unread state (on logout)
   */
  clearAll: () => {
    set({
      channelUnreads: {},
      conversationUnreads: {},
    });
  },
    }),
    {
      name: 'internhub-unread-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        channelUnreads: state.channelUnreads,
        conversationUnreads: state.conversationUnreads,
      }),
    },
  ),
);

// Selector hooks for better performance
const EMPTY_CHANNEL_UNREAD: ChannelUnread = { hasUnread: false, mentionCount: 0 };

export const useChannelUnread = (channelId: string) =>
  useUnreadStore((state) => state.channelUnreads[channelId] ?? EMPTY_CHANNEL_UNREAD);

export const useConversationUnread = (conversationId: string) => 
  useUnreadStore((state) => state.conversationUnreads[conversationId] || 0);

export const useHasAnyUnread = () => 
  useUnreadStore((state) => {
    const hasChannelUnread = Object.values(state.channelUnreads).some(u => u.hasUnread);
    const hasConversationUnread = Object.values(state.conversationUnreads).some(u => u > 0);
    return hasChannelUnread || hasConversationUnread;
  });
