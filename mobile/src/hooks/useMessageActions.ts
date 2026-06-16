/**
 * useMessageActions — shared action-sheet state for all chat screens
 *
 * Generic over message type (Message, DMMessage, ThreadMessage).
 */

import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';

export function useMessageActions<T extends { id: string; content: string }>() {
  const [selectedMessage, setSelectedMessage] = useState<T | null>(null);
  const [showActions, setShowActions] = useState(false);

  const openActions = useCallback((message: T) => {
    // Tactile confirmation that the long-press registered (UX-07).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessage(message);
    setShowActions(true);
  }, []);

  const closeActions = useCallback(() => {
    setShowActions(false);
    setSelectedMessage(null);
  }, []);

  return {
    selectedMessage,
    showActions,
    openActions,
    closeActions,
  };
}
