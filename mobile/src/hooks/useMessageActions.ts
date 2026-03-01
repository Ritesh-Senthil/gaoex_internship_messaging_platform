/**
 * useMessageActions — shared action-sheet state for all chat screens
 *
 * Generic over message type (Message, DMMessage, ThreadMessage).
 */

import { useState, useCallback } from 'react';

export function useMessageActions<T extends { id: string; content: string }>() {
  const [selectedMessage, setSelectedMessage] = useState<T | null>(null);
  const [showActions, setShowActions] = useState(false);

  const openActions = useCallback((message: T) => {
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
