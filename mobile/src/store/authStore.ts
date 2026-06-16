/**
 * Auth Store using Zustand
 * Manages authentication state across the app
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { User, AuthTokens } from '../types';
import { APP_CONFIG } from '../constants/config';
import { authApi, loadTokens, clearTokens, userApi, setOnTokenRefreshFailed } from '../services/api';
import { getIdToken, signOut as firebaseSignOut } from '../services/firebase';
import { authenticateSocket, clearSocketAuth, disconnectSocket, setOnAuthExhausted } from '../services/socket';
import { registerForPushNotifications, unregisterPushNotifications } from '../services/notifications';
import { resetSessionState } from '../utils/resetSessionState';

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

export const useAuthStore = create<AuthState>((set, get) => {
  /** Shared local cleanup for explicit logout and forced session expiry. */
  const performLocalLogout = async (options?: { skipFirebase?: boolean; skipSecureStoreUser?: boolean }) => {
    resetSessionState();
    clearSocketAuth();
    disconnectSocket();
    await clearTokens();
    if (!options?.skipSecureStoreUser) {
      try {
        await SecureStore.deleteItemAsync(APP_CONFIG.STORAGE_KEYS.USER);
      } catch {
        // Best-effort
      }
    }
    if (!options?.skipFirebase) {
      try {
        await firebaseSignOut();
      } catch {
        // Best-effort
      }
    }
    set({ user: null, isAuthenticated: false, isLoading: false, error: null });
  };

  return {
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

      const onSessionExpired = () => {
        const { isAuthenticated } = get();
        if (isAuthenticated) {
          void performLocalLogout();
        }
      };

      // Register callbacks so api.ts / socket.ts can force logout on auth failure
      setOnTokenRefreshFailed(onSessionExpired);
      setOnAuthExhausted(onSessionExpired);
      
      // Try to load existing tokens
      const hasTokens = await loadTokens();
      
      if (hasTokens) {
        // Fetch user profile to validate token
        try {
          const response = await userApi.getMe();
          
          if (response.success) {
            // Authenticate socket for online/offline tracking
            authenticateSocket(response.data.user.id);
            
            // Register for push notifications (fire-and-forget)
            registerForPushNotifications().catch(() => {
              // silently ignore
            });
            
            set({
              user: response.data.user,
              isAuthenticated: true,
              isInitialized: true,
              isLoading: false,
            });
            return;
          }
        } catch (error) {
          // Token invalid — wipe stale client state from any prior session
          await clearTokens();
          resetSessionState();
        }
      } else {
        resetSessionState();
      }
      
      set({
        user: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
      });
    } catch (error) {
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
        // Clear any stale client state from a prior session before adopting the new user.
        resetSessionState();
        
        // Store user in secure storage for persistence
        await SecureStore.setItemAsync(
          APP_CONFIG.STORAGE_KEYS.USER,
          JSON.stringify(response.data.user)
        );
        
        // Authenticate socket for online/offline tracking
        authenticateSocket(response.data.user.id);
        
        // Register for push notifications (fire-and-forget)
        registerForPushNotifications().catch(() => {
          // silently ignore
        });
        
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
      
      // Unregister push token before losing auth
      await unregisterPushNotifications();
      
      // Logout from our backend (while tokens still valid)
      try {
        await authApi.logout();
      } catch {
        // Continue local cleanup even if backend logout fails
      }
      
      await performLocalLogout();
    } catch {
      await performLocalLogout();
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
};
});
