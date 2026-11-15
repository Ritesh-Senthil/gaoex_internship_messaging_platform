/**
 * Navigation Reference
 * 
 * Provides imperative navigation from outside React components.
 * Used by the notification deep linking system to navigate when
 * the user taps a push notification.
 */

import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { dismissNotificationsForChat } from './notifications';
import { NotificationData, notificationStack, scopeForOpenedNotification } from './notificationRouting';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Whether the navigator is ready for navigation.
 * This prevents navigation attempts before the NavigationContainer mounts.
 */
let isReady = false;

export function setNavigationReady(ready: boolean) {
  isReady = ready;
}

/**
 * Queue for navigation actions that arrive before the navigator is ready.
 * This handles the cold-start case where a notification tap opens the app
 * but the navigator hasn't mounted yet.
 */
let pendingNavigation: NotificationData | null = null;

export function setPendingNavigation(data: NotificationData | null) {
  pendingNavigation = data;
}

export function consumePendingNavigation(): NotificationData | null {
  const data = pendingNavigation;
  pendingNavigation = null;
  return data;
}

export function navigateFromNotification(data: NotificationData, tappedIdentifier?: string): boolean {
  if (!isReady || !navigationRef.isReady()) {
    console.log('[DeepLink] Navigator not ready, queuing navigation');
    setPendingNavigation(data);
    return false;
  }

  const stack = notificationStack(data);
  if (!stack) {
    console.warn('[DeepLink] Notification did not identify a screen', data.type);
    return false;
  }

  try {
    navigationRef.dispatch(CommonActions.reset(stack as Parameters<typeof CommonActions.reset>[0]));
    const scope = scopeForOpenedNotification(data, tappedIdentifier);
    if (scope) dismissNotificationsForChat(scope).catch(() => {});
    return true;
  } catch (error) {
    console.error('[DeepLink] Navigation failed:', error);
    return false;
  }
}

/**
 * Imperative navigation helpers for local screenshot capture automation.
 */
export function navigateToTab(
  tab: 'Programs' | 'DirectMessages' | 'SearchTab' | 'Profile'
): boolean {
  if (!isReady || !navigationRef.isReady()) return false;
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          state: {
            index: ['Programs', 'DirectMessages', 'SearchTab', 'Profile'].indexOf(tab),
            routes: [
              { name: 'Programs' },
              { name: 'DirectMessages' },
              { name: 'SearchTab' },
              { name: 'Profile' },
            ],
          },
        },
      ],
    })
  );
  return true;
}

export function navigateToProgram(programId: string): boolean {
  return navigateFromNotification({ type: 'program_invite', programId });
}

export function navigateToChannel(
  channelId: string,
  channelName: string,
  programId: string
): boolean {
  return navigateFromNotification({
    type: 'channel_message',
    channelId,
    channelName,
    programId,
  });
}

export function navigateToConversation(
  conversationId: string,
  name: string
): boolean {
  return navigateFromNotification({
    type: 'dm_message',
    conversationId,
    authorName: name,
  });
}
