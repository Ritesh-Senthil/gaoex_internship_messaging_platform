/**
 * Push Notification Service
 * 
 * Handles:
 * - Permission requests
 * - Expo push token retrieval  
 * - Token registration with backend
 * - Foreground notification display
 * - Token cleanup on logout
 * 
 * IMPORTANT: All expo-notifications usage is wrapped in try-catch
 * so the app works in Expo Go (simulator) where the native module
 * 'ExpoPushTokenManager' is not available.
 */

import { Platform, AppState, AppStateStatus } from 'react-native';
import { pushTokenApi } from './api';
import { useNotificationStore } from '../store/notificationStore';

// Lazy-load expo-notifications to avoid crash in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;

try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
} catch (e) {
  console.log('[Notifications] Native module not available (Expo Go?) — push notifications disabled');
}

/**
 * Whether the native notifications module is available.
 * False in Expo Go, true in dev client / production builds.
 */
function isAvailable(): boolean {
  return Notifications !== null;
}

// Store the token locally so we can remove it on logout
let currentPushToken: string | null = null;

// ============================================
// CONFIGURATION
// ============================================

/**
 * Configure how notifications appear when the app is in the foreground.
 * This must be called early (before any notifications arrive).
 * No-op if native module is unavailable.
 */
export function configureNotificationHandler(): void {
  if (!isAvailable()) return;

  try {
    Notifications!.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (error) {
    console.warn('[Notifications] Failed to configure handler:', error);
  }
}

/**
 * Set up Android notification channels.
 * On iOS this is a no-op (iOS handles categories differently).
 */
async function setupAndroidChannels(): Promise<void> {
  if (!isAvailable() || Platform.OS !== 'android') return;

  await Notifications!.setNotificationChannelAsync('channel_message', {
    name: 'Channel Messages',
    importance: Notifications!.AndroidImportance.DEFAULT,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications!.setNotificationChannelAsync('dm_message', {
    name: 'Direct Messages',
    importance: Notifications!.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications!.setNotificationChannelAsync('mention', {
    name: 'Mentions',
    importance: Notifications!.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications!.setNotificationChannelAsync('program_invite', {
    name: 'Program Invitations',
    importance: Notifications!.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

// ============================================
// PERMISSION & TOKEN
// ============================================

/**
 * Request notification permissions from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestPermissions(): Promise<boolean> {
  if (!isAvailable()) return false;

  const store = useNotificationStore.getState();

  // Physical device check — push tokens don't work on simulator
  if (Device && !Device.isDevice) {
    console.log('[Notifications] Not a physical device — skipping push token registration');
    store.setPermissionStatus('denied');
    return false;
  }

  const { status: existingStatus } = await Notifications!.getPermissionsAsync();

  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications!.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission not granted');
    store.setPermissionStatus('denied');
    return false;
  }

  store.setPermissionStatus('granted');
  return true;
}

/**
 * Get the Expo push token for this device.
 * Returns null if permissions aren't granted or not on a physical device.
 */
async function getExpoPushToken(): Promise<string | null> {
  if (!isAvailable()) return null;

  try {
    // projectId is required for Expo push tokens in EAS builds
    const tokenData = await Notifications!.getExpoPushTokenAsync({
      projectId: '7b7d8aa7-feb3-4708-90f7-9a9ef01c2c97',
    });
    return tokenData.data;
  } catch (error) {
    console.error('[Notifications] Failed to get push token:', error);
    return null;
  }
}

/**
 * Full registration flow:
 * 1. Request permissions
 * 2. Get Expo push token
 * 3. Register with backend
 * 
 * Call this after successful login.
 * Safe to call multiple times (backend upserts).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!isAvailable()) {
    console.log('[Notifications] Native module not available — skipping registration');
    return null;
  }

  const store = useNotificationStore.getState();

  // Prevent concurrent registrations
  if (store.isRegistering) {
    console.log('[Notifications] Registration already in progress');
    return store.pushToken;
  }

  store.setIsRegistering(true);

  try {
    // Set up Android channels
    await setupAndroidChannels();

    // Request permissions
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      store.setIsRegistering(false);
      return null;
    }

    // Get token
    const token = await getExpoPushToken();
    if (!token) {
      console.log('[Notifications] No push token available');
      store.setIsRegistering(false);
      return null;
    }

    // Register with backend
    const platform = Platform.OS === 'android' ? 'android' : 'ios';
    await pushTokenApi.register(token, platform);
    
    // Store locally for logout cleanup + store
    currentPushToken = token;
    store.setPushToken(token);
    
    console.log('[Notifications] Push token registered:', token.substring(0, 30) + '...');
    return token;
  } catch (error) {
    console.error('[Notifications] Registration failed:', error);
    return null;
  } finally {
    store.setIsRegistering(false);
  }
}

/**
 * Unregister push token from the backend.
 * Call this on logout to stop notifications.
 */
export async function unregisterPushNotifications(): Promise<void> {
  const store = useNotificationStore.getState();
  try {
    if (currentPushToken) {
      await pushTokenApi.remove(currentPushToken);
      console.log('[Notifications] Push token removed from backend');
      currentPushToken = null;
    }
  } catch (error) {
    // Don't fail logout if push cleanup fails
    console.error('[Notifications] Failed to remove push token:', error);
    currentPushToken = null;
  }
  // Clear store regardless
  store.clear();
}

// ============================================
// TOKEN REFRESH & APP STATE
// ============================================

/**
 * Re-check and refresh the push token.
 * Call this when the app comes to the foreground to detect token changes.
 * Expo push tokens can change after app updates or OS updates.
 */
export async function refreshPushTokenIfNeeded(): Promise<void> {
  if (!isAvailable()) return;
  if (Device && !Device.isDevice) return;

  try {
    const { status } = await Notifications!.getPermissionsAsync();
    if (status !== 'granted') return;

    const tokenData = await Notifications!.getExpoPushTokenAsync({
      projectId: '7b7d8aa7-feb3-4708-90f7-9a9ef01c2c97',
    });
    const newToken = tokenData.data;

    // Only re-register if the token changed
    if (newToken && newToken !== currentPushToken) {
      console.log('[Notifications] Token changed, re-registering...');
      const platform = Platform.OS === 'android' ? 'android' : 'ios';
      await pushTokenApi.register(newToken, platform);
      currentPushToken = newToken;
      useNotificationStore.getState().setPushToken(newToken);
    }
  } catch (error) {
    console.error('[Notifications] Token refresh check failed:', error);
  }
}

/**
 * Set up an AppState listener that re-checks the push token
 * when the app comes back to the foreground.
 * Returns a cleanup function.
 */
export function startAppStateTokenRefresh(): () => void {
  if (!isAvailable()) {
    return () => {}; // No-op cleanup
  }

  let appState = AppState.currentState;

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App just came to foreground — check if token changed
      refreshPushTokenIfNeeded().catch(() => {});
    }
    appState = nextAppState;
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}

// ============================================
// NOTIFICATION RESPONSE (TAP) HANDLING
// ============================================

export type NotificationData = {
  type?: 'channel_message' | 'dm_message' | 'mention' | 'program_invite';
  channelId?: string;
  programId?: string;
  channelName?: string;
  conversationId?: string;
  authorName?: string;
};

/**
 * Add a listener for when the user taps a notification.
 * Returns a cleanup function.
 */
export function addNotificationResponseListener(
  handler: (data: NotificationData) => void
): () => void {
  if (!isAvailable()) return () => {};

  const subscription = Notifications!.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as NotificationData;
      handler(data);
    }
  );

  return () => subscription.remove();
}

/**
 * Add a listener for notifications received while app is in foreground.
 * Returns a cleanup function.
 */
export function addNotificationReceivedListener(
  handler: (notification: any) => void
): () => void {
  if (!isAvailable()) return () => {};

  const subscription = Notifications!.addNotificationReceivedListener(handler);
  return () => subscription.remove();
}

/**
 * Check if the app was opened from a notification (cold start).
 * Call this once on app startup.
 * 
 * Filters out stale notifications older than 30 seconds to avoid
 * re-navigating to an old notification on a normal app launch.
 */
export async function getInitialNotification(): Promise<NotificationData | null> {
  if (!isAvailable()) return null;

  const response = await Notifications!.getLastNotificationResponseAsync();
  if (response) {
    // Only process recent notification taps (within 30 seconds)
    // This prevents navigating to old notifications on normal app launch
    const notificationDate = response.notification.date;
    const ageMs = Date.now() - notificationDate * 1000;
    const MAX_AGE_MS = 30_000; // 30 seconds

    if (ageMs > MAX_AGE_MS) {
      console.log(`[Notifications] Ignoring stale initial notification (age: ${Math.round(ageMs / 1000)}s)`);
      return null;
    }

    return response.notification.request.content.data as NotificationData;
  }
  return null;
}

/**
 * Clear all delivered notifications from the notification center.
 */
export async function clearAllNotifications(): Promise<void> {
  if (!isAvailable()) return;
  await Notifications!.dismissAllNotificationsAsync();
}

/**
 * Get the current badge count.
 */
export async function getBadgeCount(): Promise<number> {
  if (!isAvailable()) return 0;
  return Notifications!.getBadgeCountAsync();
}

/**
 * Set the app badge count.
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (!isAvailable()) return;
  await Notifications!.setBadgeCountAsync(count);
}
