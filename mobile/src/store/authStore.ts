/**
 * Auth Store using Zustand
 * Manages authentication state across the app
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, AuthTokens } from '../types';
import { APP_CONFIG } from '../constants/config';
import { authApi, loadTokens, clearTokens, userApi } from '../services/api';
import { getIdToken, signOut as firebaseSignOut } from '../services/firebase';

interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  
  // Actions
  initialize: () => Promise<void>;
  loginWithFirebase: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,
  
  /**
   * Initialize auth state from stored tokens
   */
  initialize: async () => {
    try {
      set({ isLoading: true });
      
      // Try to load existing tokens
      const hasTokens = await loadTokens();
      
      if (hasTokens) {
        // Fetch user profile to validate token
        try {
          const response = await userApi.getMe();
          
          if (response.success) {
            set({
              user: response.data.user,
              isAuthenticated: true,
              isInitialized: true,
              isLoading: false,
            });
            return;
          }
        } catch (error) {
          // Token invalid, clear and continue
          await clearTokens();
        }
      }
      
      set({
        user: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Auth initialization failed:', error);
      set({
        error: 'Failed to initialize authentication',
        isInitialized: true,
        isLoading: false,
      });
    }
  },
  
  /**
   * Login with Firebase token
   * Call this after successful Google/Facebook sign-in
   */
  loginWithFirebase: async () => {
    try {
      set({ isLoading: true, error: null });
      
      // Get Firebase ID token
      const idToken = await getIdToken();
      
      if (!idToken) {
        throw new Error('No Firebase token available. Please sign in again.');
      }
      
      // Send to our backend
      const response = await authApi.loginWithFirebase(idToken);
      
      if (response.success) {
        // Store user in secure storage for persistence
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.USER,
          JSON.stringify(response.data.user)
        );
        
        set({
          user: response.data.user,
          isAuthenticated: true,
          isLoading: false,
        });
        
        return true;
      } else {
        throw new Error(response.error?.message || 'Login failed');
      }
    } catch (error: any) {
      console.error('Login failed:', error);
      set({
        error: error.message || 'Login failed. Please try again.',
        isLoading: false,
      });
      return false;
    }
  },
  
  /**
   * Logout from both Firebase and our backend
   */
  logout: async () => {
    try {
      set({ isLoading: true });
      
      // Logout from our backend
      await authApi.logout();
      
      // Logout from Firebase
      await firebaseSignOut();
      
      // Clear stored user
      await SecureStore.deleteItemAsync(APP_CONFIG.STORAGE_KEYS.USER);
      
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('Logout failed:', error);
      // Even if logout fails, clear local state
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
  
  /**
   * Update user data locally
   */
  updateUser: (userData: Partial<User>) => {
    const currentUser = get().user;
    if (currentUser) {
      set({
        user: { ...currentUser, ...userData },
      });
    }
  },
  
  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null });
  },
}));
