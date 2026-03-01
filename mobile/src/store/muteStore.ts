/**
 * Mute Store using Zustand
 * Tracks per-channel and per-conversation mute state for instant UI updates.
 * Updated locally when the user toggles mute — no refetch needed.
 */

import { create } from 'zustand';

interface MuteState {
  // channelId -> isMuted
  channelMutes: Record<string, boolean>;
  // conversationId -> isMuted
  conversationMutes: Record<string, boolean>;

  // Actions
  setChannelMuted: (channelId: string, isMuted: boolean) => void;
  setConversationMuted: (conversationId: string, isMuted: boolean) => void;
  initChannelMutes: (mutes: Record<string, boolean>) => void;
  initConversationMutes: (mutes: Record<string, boolean>) => void;
  clear: () => void;
}

export const useMuteStore = create<MuteState>((set) => ({
  channelMutes: {},
  conversationMutes: {},

  setChannelMuted: (channelId, isMuted) => {
    set((state) => ({
      channelMutes: { ...state.channelMutes, [channelId]: isMuted },
    }));
  },

  setConversationMuted: (conversationId, isMuted) => {
    set((state) => ({
      conversationMutes: { ...state.conversationMutes, [conversationId]: isMuted },
    }));
  },

  initChannelMutes: (mutes) => {
    set((state) => ({
      channelMutes: { ...state.channelMutes, ...mutes },
    }));
  },

  initConversationMutes: (mutes) => {
    set((state) => ({
      conversationMutes: { ...state.conversationMutes, ...mutes },
    }));
  },

  clear: () => {
    set({ channelMutes: {}, conversationMutes: {} });
  },
}));

// Selector hooks
export const useChannelMuted = (channelId: string) =>
  useMuteStore((state) => state.channelMutes[channelId] ?? false);

export const useConversationMuted = (conversationId: string) =>
  useMuteStore((state) => state.conversationMutes[conversationId] ?? false);
