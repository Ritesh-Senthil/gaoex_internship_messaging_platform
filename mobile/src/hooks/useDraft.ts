/**
 * useDraft Hook
 * Persists unsent message text per channel/conversation/thread using AsyncStorage.
 *
 * Usage:
 *   const { messageText, setMessageText, clearDraft } = useDraft(`channel:${channelId}`);
 *
 * Keys:
 *   draft:channel:{channelId}
 *   draft:conversation:{conversationId}
 *   draft:thread:{parentMessageId}
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_PREFIX = 'draft:';
const SAVE_DEBOUNCE_MS = 500;

export function useDraft(key: string) {
  const storageKey = `${DRAFT_PREFIX}${key}`;
  const [messageText, setMessageTextState] = useState('');
  const pendingText = useRef<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  // Load saved draft on mount
  useEffect(() => {
    isMounted.current = true;

    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (isMounted.current && saved) {
          setMessageTextState(saved);
        }
      })
      .catch(() => {
        // Silently ignore read errors
      });

    // Flush pending save on unmount
    return () => {
      isMounted.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      // Synchronously flush the last pending text
      if (pendingText.current !== null) {
        const text = pendingText.current;
        pendingText.current = null;
        if (text.length > 0) {
          AsyncStorage.setItem(storageKey, text).catch(() => {});
        } else {
          AsyncStorage.removeItem(storageKey).catch(() => {});
        }
      }
    };
  }, [storageKey]);

  // Debounced save wrapper
  const setMessageText = useCallback(
    (text: string) => {
      setMessageTextState(text);
      pendingText.current = text;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null;
        pendingText.current = null;
        if (text.length > 0) {
          AsyncStorage.setItem(storageKey, text).catch(() => {});
        } else {
          AsyncStorage.removeItem(storageKey).catch(() => {});
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [storageKey],
  );

  // Clear draft (call on successful send)
  const clearDraft = useCallback(() => {
    setMessageTextState('');
    pendingText.current = null;
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  return { messageText, setMessageText, clearDraft };
}
