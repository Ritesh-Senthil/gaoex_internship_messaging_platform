/**
 * useCustomStatus — custom status modal state, expiration timer, save/clear
 *
 * Extracted from ProfileScreen. Manages the full lifecycle of a user's custom status.
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { userApi } from '../services/api';
import { User } from '../types';

// ─── Status Duration Options ─────────────────────────────────
export const STATUS_DURATIONS = [
  { label: '10 Seconds', ms: 10 * 1000 },  // DEV: for testing
  { label: '30 Minutes', ms: 30 * 60 * 1000 },
  { label: '1 Hour',     ms: 60 * 60 * 1000 },
  { label: '4 Hours',    ms: 4 * 60 * 60 * 1000 },
  { label: 'Today',      ms: -1 }, // special: end of day
  { label: "Don't Clear", ms: 0 }, // null expiration
] as const;

export const STATUS_TEXT_MAX = 128;

interface UseCustomStatusOptions {
  user: User | null;
  updateUser: (user: Partial<User>) => void;
}

export function useCustomStatus({ user, updateUser }: UseCustomStatusOptions) {
  // Modal state
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);
  const [draftStatusEmoji, setDraftStatusEmoji] = useState('');
  const [draftStatusText, setDraftStatusText] = useState('');
  const [draftDurationIdx, setDraftDurationIdx] = useState(5); // default: Don't Clear
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  // Derived
  const hasStatus = !!(user?.statusEmoji || user?.statusText);

  // Real-time status expiration timer
  const [isStatusExpired, setIsStatusExpired] = useState(() => {
    if (!user?.statusExpiresAt) return false;
    return new Date(user.statusExpiresAt).getTime() <= Date.now();
  });

  useEffect(() => {
    if (!user?.statusExpiresAt) {
      setIsStatusExpired(false);
      return;
    }

    const expiresAt = new Date(user.statusExpiresAt).getTime();
    const now = Date.now();

    if (expiresAt <= now) {
      setIsStatusExpired(true);
      return;
    }

    // Not expired yet — set a timer to flip at exactly the expiration time
    setIsStatusExpired(false);
    const timer = setTimeout(() => setIsStatusExpired(true), expiresAt - now);
    return () => clearTimeout(timer);
  }, [user?.statusExpiresAt]);

  const showStatus = hasStatus && !isStatusExpired;

  // ─── Handlers ───────────────────────────────────────────────

  const handleOpenStatus = useCallback(() => {
    if (showStatus) {
      setDraftStatusEmoji(user?.statusEmoji || '');
      setDraftStatusText(user?.statusText || '');
      setDraftDurationIdx(5); // keep "Don't Clear" as default when editing
    } else {
      setDraftStatusEmoji('');
      setDraftStatusText('');
      setDraftDurationIdx(5);
    }
    setIsStatusModalVisible(true);
  }, [showStatus, user?.statusEmoji, user?.statusText]);

  const closeStatusModal = useCallback(() => {
    setIsStatusModalVisible(false);
  }, []);

  const computeExpiresAt = useCallback((idx: number): string | null => {
    const { ms } = STATUS_DURATIONS[idx];
    if (ms === 0) return null; // Don't Clear
    if (ms === -1) {
      // "Today" — end of current day
      const eod = new Date();
      eod.setHours(23, 59, 59, 999);
      return eod.toISOString();
    }
    return new Date(Date.now() + ms).toISOString();
  }, []);

  const handleSaveStatus = useCallback(async () => {
    const emoji = draftStatusEmoji.trim();
    const text = draftStatusText.trim();

    if (!emoji && !text) {
      Alert.alert('Error', 'Enter an emoji or text for your status');
      return;
    }
    if (text.length > STATUS_TEXT_MAX) {
      Alert.alert('Error', `Status text must be ${STATUS_TEXT_MAX} characters or less`);
      return;
    }

    setIsSavingStatus(true);
    try {
      const response = await userApi.updateProfile({
        statusEmoji: emoji || null,
        statusText: text || null,
        statusExpiresAt: computeExpiresAt(draftDurationIdx),
      });
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
        setIsStatusModalVisible(false);
      }
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.response?.data?.error?.message ||
          error?.message ||
          'Failed to set status',
      );
    } finally {
      setIsSavingStatus(false);
    }
  }, [draftStatusEmoji, draftStatusText, draftDurationIdx, computeExpiresAt, updateUser]);

  const handleClearStatus = useCallback(async () => {
    setIsSavingStatus(true);
    try {
      const response = await userApi.updateProfile({
        statusEmoji: null,
        statusText: null,
        statusExpiresAt: null,
      });
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
        setIsStatusModalVisible(false);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to clear status');
    } finally {
      setIsSavingStatus(false);
    }
  }, [updateUser]);

  return {
    // Modal visibility
    isStatusModalVisible,
    closeStatusModal,
    // Draft state
    draftStatusEmoji,
    setDraftStatusEmoji,
    draftStatusText,
    setDraftStatusText,
    draftDurationIdx,
    setDraftDurationIdx,
    // Saving state
    isSavingStatus,
    // Derived
    showStatus,
    // Actions
    handleOpenStatus,
    handleSaveStatus,
    handleClearStatus,
  };
}
