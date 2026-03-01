/**
 * Channel Store using Zustand
 * Manages channel and category state for real-time updates
 */

import { create } from 'zustand';
import { Channel, Category } from '../types';

interface ChannelState {
  // State - organized by program
  channelsByProgram: Record<string, Channel[]>; // programId -> channels (uncategorized)
  categoriesByProgram: Record<string, Category[]>; // programId -> categories (with channels)
  
  // Actions - Channels
  setChannels: (programId: string, channels: Channel[], categories: Category[]) => void;
  addChannel: (programId: string, channel: Channel) => void;
  updateChannel: (programId: string, channelId: string, updates: Partial<Channel>) => void;
  removeChannel: (programId: string, channelId: string) => void;
  moveChannel: (programId: string, channelId: string, toCategoryId: string | null) => void;
  
  // Actions - Categories
  addCategory: (programId: string, category: Category) => void;
  updateCategory: (programId: string, categoryId: string, updates: Partial<Category>) => void;
  removeCategory: (programId: string, categoryId: string) => void;
  
  // Utility
  clearProgram: (programId: string) => void;
  clearAll: () => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  // Initial state
  channelsByProgram: {},
  categoriesByProgram: {},
  
  /**
   * Set all channels and categories for a program (from API)
   */
  setChannels: (programId: string, channels: Channel[], categories: Category[]) => {
    set((state) => ({
      channelsByProgram: {
        ...state.channelsByProgram,
        [programId]: channels,
      },
      categoriesByProgram: {
        ...state.categoriesByProgram,
        [programId]: categories,
      },
    }));
  },
  
  /**
   * Add a new channel to a program
   */
  addChannel: (programId: string, channel: Channel) => {
    set((state) => {
      const categoryId = channel.categoryId;
      
      if (categoryId) {
        // Add to category
        const categories = state.categoriesByProgram[programId] || [];
        return {
          categoriesByProgram: {
            ...state.categoriesByProgram,
            [programId]: categories.map(cat => 
              cat.id === categoryId 
                ? { ...cat, channels: [...(cat.channels || []), channel] }
                : cat
            ),
          },
        };
      } else {
        // Add to uncategorized
        const channels = state.channelsByProgram[programId] || [];
        return {
          channelsByProgram: {
            ...state.channelsByProgram,
            [programId]: [...channels, channel],
          },
        };
      }
    });
  },
  
  /**
   * Update an existing channel
   */
  updateChannel: (programId: string, channelId: string, updates: Partial<Channel>) => {
    set((state) => {
      // Update in uncategorized channels
      const channels = state.channelsByProgram[programId] || [];
      const updatedChannels = channels.map(ch => 
        ch.id === channelId ? { ...ch, ...updates } : ch
      );
      
      // Update in categories
      const categories = state.categoriesByProgram[programId] || [];
      const updatedCategories = categories.map(cat => ({
        ...cat,
        channels: (cat.channels || []).map(ch => 
          ch.id === channelId ? { ...ch, ...updates } : ch
        ),
      }));
      
      return {
        channelsByProgram: {
          ...state.channelsByProgram,
          [programId]: updatedChannels,
        },
        categoriesByProgram: {
          ...state.categoriesByProgram,
          [programId]: updatedCategories,
        },
      };
    });
  },
  
  /**
   * Remove a channel from a program
   */
  removeChannel: (programId: string, channelId: string) => {
    set((state) => {
      // Remove from uncategorized
      const channels = state.channelsByProgram[programId] || [];
      const filteredChannels = channels.filter(ch => ch.id !== channelId);
      
      // Remove from categories
      const categories = state.categoriesByProgram[programId] || [];
      const updatedCategories = categories.map(cat => ({
        ...cat,
        channels: (cat.channels || []).filter(ch => ch.id !== channelId),
      }));
      
      return {
        channelsByProgram: {
          ...state.channelsByProgram,
          [programId]: filteredChannels,
        },
        categoriesByProgram: {
          ...state.categoriesByProgram,
          [programId]: updatedCategories,
        },
      };
    });
  },
  
  /**
   * Move a channel to a different category
   */
  moveChannel: (programId: string, channelId: string, toCategoryId: string | null) => {
    set((state) => {
      let movedChannel: Channel | null = null;
      
      // Find and remove the channel from its current location
      const channels = state.channelsByProgram[programId] || [];
      const filteredChannels = channels.filter(ch => {
        if (ch.id === channelId) {
          movedChannel = ch;
          return false;
        }
        return true;
      });
      
      const categories = state.categoriesByProgram[programId] || [];
      const updatedCategories = categories.map(cat => {
        const filtered = (cat.channels || []).filter(ch => {
          if (ch.id === channelId) {
            movedChannel = ch;
            return false;
          }
          return true;
        });
        return { ...cat, channels: filtered };
      });
      
      if (!movedChannel) return state;
      
      // Add to new location — assert non-null since we checked above
      const foundChannel: Channel = movedChannel;
      const updatedChannel = { ...foundChannel, categoryId: toCategoryId };
      
      if (toCategoryId) {
        // Add to target category
        return {
          channelsByProgram: {
            ...state.channelsByProgram,
            [programId]: filteredChannels,
          },
          categoriesByProgram: {
            ...state.categoriesByProgram,
            [programId]: updatedCategories.map(cat =>
              cat.id === toCategoryId
                ? { ...cat, channels: [...(cat.channels || []), updatedChannel] }
                : cat
            ),
          },
        };
      } else {
        // Add to uncategorized
        return {
          channelsByProgram: {
            ...state.channelsByProgram,
            [programId]: [...filteredChannels, updatedChannel],
          },
          categoriesByProgram: {
            ...state.categoriesByProgram,
            [programId]: updatedCategories,
          },
        };
      }
    });
  },
  
  /**
   * Add a new category to a program
   */
  addCategory: (programId: string, category: Category) => {
    set((state) => {
      const categories = state.categoriesByProgram[programId] || [];
      return {
        categoriesByProgram: {
          ...state.categoriesByProgram,
          [programId]: [...categories, { ...category, channels: [] }],
        },
      };
    });
  },
  
  /**
   * Update an existing category
   */
  updateCategory: (programId: string, categoryId: string, updates: Partial<Category>) => {
    set((state) => {
      const categories = state.categoriesByProgram[programId] || [];
      return {
        categoriesByProgram: {
          ...state.categoriesByProgram,
          [programId]: categories.map(cat =>
            cat.id === categoryId ? { ...cat, ...updates } : cat
          ),
        },
      };
    });
  },
  
  /**
   * Remove a category (channels move to uncategorized)
   */
  removeCategory: (programId: string, categoryId: string) => {
    set((state) => {
      const categories = state.categoriesByProgram[programId] || [];
      const categoryToRemove = categories.find(c => c.id === categoryId);
      const channelsToMove = categoryToRemove?.channels || [];
      
      // Remove category and move its channels to uncategorized
      const channels = state.channelsByProgram[programId] || [];
      const movedChannels = channelsToMove.map(ch => ({ ...ch, categoryId: null }));
      
      return {
        channelsByProgram: {
          ...state.channelsByProgram,
          [programId]: [...channels, ...movedChannels],
        },
        categoriesByProgram: {
          ...state.categoriesByProgram,
          [programId]: categories.filter(cat => cat.id !== categoryId),
        },
      };
    });
  },
  
  /**
   * Clear data for a specific program
   */
  clearProgram: (programId: string) => {
    set((state) => {
      const { [programId]: _, ...restChannels } = state.channelsByProgram;
      const { [programId]: __, ...restCategories } = state.categoriesByProgram;
      return {
        channelsByProgram: restChannels,
        categoriesByProgram: restCategories,
      };
    });
  },
  
  /**
   * Clear all channel/category state (on logout)
   */
  clearAll: () => {
    set({
      channelsByProgram: {},
      categoriesByProgram: {},
    });
  },
}));

// Selector hooks for better performance
export const useProgramChannels = (programId: string) => 
  useChannelStore((state) => state.channelsByProgram[programId] || []);

export const useProgramCategories = (programId: string) => 
  useChannelStore((state) => state.categoriesByProgram[programId] || []);
