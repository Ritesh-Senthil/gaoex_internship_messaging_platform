/**
 * Presence Store using Zustand
 * Manages user online/offline status for real-time updates
 */

import { create } from 'zustand';

interface PresenceState {
  // State - map of userId to online status
  onlineUsers: Record<string, boolean>; // userId -> isOnline
  
  // Actions
  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string) => void;
  setMultipleOnline: (userIds: string[]) => void;
  isUserOnline: (userId: string) => boolean;
  
  // Utility
  clearAll: () => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  // Initial state
  onlineUsers: {},
  
  /**
   * Set a user as online
   */
  setUserOnline: (userId: string) => {
    set((state) => ({
      onlineUsers: {
        ...state.onlineUsers,
        [userId]: true,
      },
    }));
  },
  
  /**
   * Set a user as offline
   */
  setUserOffline: (userId: string) => {
    set((state) => ({
      onlineUsers: {
        ...state.onlineUsers,
        [userId]: false,
      },
    }));
  },
  
  /**
   * Set multiple users as online (batch update)
   */
  setMultipleOnline: (userIds: string[]) => {
    set((state) => {
      const updates: Record<string, boolean> = {};
      userIds.forEach(id => {
        updates[id] = true;
      });
      return {
        onlineUsers: {
          ...state.onlineUsers,
          ...updates,
        },
      };
    });
  },
  
  /**
   * Check if a user is online
   */
  isUserOnline: (userId: string) => {
    return get().onlineUsers[userId] ?? false;
  },
  
  /**
   * Clear all presence state (on logout)
   */
  clearAll: () => {
    set({ onlineUsers: {} });
  },
}));

// Selector hook for a specific user's online status
export const useUserOnlineStatus = (userId: string) => 
  usePresenceStore((state) => state.onlineUsers[userId] ?? false);
