/**
 * Navigation Reference
 * 
 * Provides imperative navigation from outside React components.
 * Used by the notification deep linking system to navigate when
 * the user taps a push notification.
 */

import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { NotificationData, clearAllNotifications, setBadgeCount } from './notifications';

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

/**
 * Navigate to the appropriate screen based on notification data.
 * 
 * Handles:
 * - channel_message → Channel screen
 * - mention → Channel screen  
 * - dm_message → Conversation screen
 * - program_invite → ProgramDetail screen
 * 
 * The navigation resets the stack to Main → target screen so the
 * back button returns to the home screen (not a stale stack).
 */
export function navigateFromNotification(data: NotificationData): boolean {
  if (!isReady || !navigationRef.isReady()) {
    // Navigator not ready — queue for later
    console.log('[DeepLink] Navigator not ready, queuing navigation');
    setPendingNavigation(data);
    return false;
  }

  const { type } = data;
  let navigated = false;

  try {
    switch (type) {
      case 'channel_message':
      case 'mention': {
        const { channelId, channelName, programId } = data;
        if (!channelId || !programId) {
          console.warn('[DeepLink] Missing channelId or programId for channel navigation');
          return false;
        }
        // Navigate: Main → Channel
        navigationRef.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              {
                name: 'Channel',
                params: {
                  channelId,
                  channelName: channelName || 'channel',
                  programId,
                },
              },
            ],
          })
        );
        console.log(`[DeepLink] Navigated to channel: #${channelName}`);
        navigated = true;
        break;
      }

      case 'dm_message': {
        const { conversationId, authorName } = data;
        if (!conversationId) {
          console.warn('[DeepLink] Missing conversationId for DM navigation');
          return false;
        }
        // Navigate: Main → Conversation
        navigationRef.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              {
                name: 'Conversation',
                params: {
                  conversationId,
                  name: authorName || 'Direct Message',
                },
              },
            ],
          })
        );
        console.log(`[DeepLink] Navigated to DM: ${authorName}`);
        navigated = true;
        break;
      }

      case 'program_invite': {
        const { programId } = data;
        if (!programId) {
          console.warn('[DeepLink] Missing programId for program invite navigation');
          return false;
        }
        // Navigate: Main → ProgramDetail
        navigationRef.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'Main' },
              {
                name: 'ProgramDetail',
                params: { programId },
              },
            ],
          })
        );
        console.log(`[DeepLink] Navigated to program: ${programId}`);
        navigated = true;
        break;
      }

      default:
        console.warn(`[DeepLink] Unknown notification type: ${type}`);
        return false;
    }

    // After successful navigation, clear the notification tray and reset badge
    if (navigated) {
      clearAllNotifications().catch(() => {});
      setBadgeCount(0).catch(() => {});
    }

    return navigated;
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
