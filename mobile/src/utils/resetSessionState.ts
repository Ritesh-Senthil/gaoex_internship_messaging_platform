/**
 * Wipe all user-scoped client state on logout / session expiry so the next
 * login never inherits another account's messages, badges, drafts, etc.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMessageStore } from '../store/messageStore';
import { useChannelStore } from '../store/channelStore';
import { useUnreadStore } from '../store/unreadStore';
import { useMuteStore } from '../store/muteStore';
import { usePresenceStore } from '../store/presenceStore';
import { useMemberStore } from '../store/memberStore';
import { useRoleStore } from '../store/roleStore';
import { useActiveChatStore } from '../store/activeChatStore';

const DRAFT_PREFIX = 'draft:';

async function clearAllDrafts(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const draftKeys = keys.filter((k) => k.startsWith(DRAFT_PREFIX));
    if (draftKeys.length > 0) {
      await AsyncStorage.multiRemove(draftKeys);
    }
  } catch {
    // Best-effort
  }
}

/** Clear every Zustand slice + persisted compose drafts for the current session. */
export function resetSessionState(): void {
  useMessageStore.getState().clearAll();
  useChannelStore.getState().clearAll();
  useUnreadStore.getState().clearAll();
  useMuteStore.getState().clear();
  usePresenceStore.getState().clearAll();
  useMemberStore.getState().clearAll();
  useRoleStore.getState().clearAll();
  useActiveChatStore.getState().clearAll();
  void clearAllDrafts();
}
