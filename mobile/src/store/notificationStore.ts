/**
 * Notification Store using Zustand
 * Manages push notification state: permission status, token, and settings
 */

import { create } from 'zustand';

type PermissionStatus = 'undetermined' | 'granted' | 'denied';

interface NotificationState {
  // State
  permissionStatus: PermissionStatus;
  pushToken: string | null;
  isRegistering: boolean;

  // Actions
  setPermissionStatus: (status: PermissionStatus) => void;
  setPushToken: (token: string | null) => void;
  setIsRegistering: (registering: boolean) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  // Initial state
  permissionStatus: 'undetermined',
  pushToken: null,
  isRegistering: false,

  setPermissionStatus: (status: PermissionStatus) => {
    set({ permissionStatus: status });
  },

  setPushToken: (token: string | null) => {
    set({ pushToken: token });
  },

  setIsRegistering: (registering: boolean) => {
    set({ isRegistering: registering });
  },

  clear: () => {
    set({
      permissionStatus: 'undetermined',
      pushToken: null,
      isRegistering: false,
    });
  },
}));
