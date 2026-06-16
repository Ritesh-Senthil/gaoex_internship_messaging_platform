/**
 * Tracks which channel/conversation the user is actively viewing.
 * Unread handlers consult this so opening a chat from Search or a push
 * notification doesn't get false unread increments.
 */

import { create } from 'zustand';

interface ActiveChatState {
  channelId: string | null;
  conversationId: string | null;
  setActiveChannel: (channelId: string | null) => void;
  setActiveConversation: (conversationId: string | null) => void;
  clearAll: () => void;
}

export const useActiveChatStore = create<ActiveChatState>((set) => ({
  channelId: null,
  conversationId: null,

  setActiveChannel: (channelId) => set({ channelId }),
  setActiveConversation: (conversationId) => set({ conversationId }),

  clearAll: () => set({ channelId: null, conversationId: null }),
}));

/** Imperative read for socket/unread handlers outside React. */
export function getActiveChannelId(): string | null {
  return useActiveChatStore.getState().channelId;
}

export function getActiveConversationId(): string | null {
  return useActiveChatStore.getState().conversationId;
}
