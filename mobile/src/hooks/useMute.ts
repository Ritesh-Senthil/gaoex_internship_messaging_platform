/**
 * useMute — shared mute toggle logic for channels and conversations
 *
 * Fetches initial mute status on mount and provides an optimistic toggle handler.
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { muteApi } from '../services/api';
import { useMuteStore } from '../store/muteStore';

export function useMute(type: 'channel' | 'conversation', entityId: string) {
  const [isMuted, setIsMuted] = useState(false);
  const [isMuteLoading, setIsMuteLoading] = useState(false);

  // Select only the stable action functions — avoids subscribing to all store changes
  const setChannelMuted = useMuteStore(s => s.setChannelMuted);
  const setConversationMuted = useMuteStore(s => s.setConversationMuted);

  const updateStore = useCallback(
    (muted: boolean) => {
      if (type === 'channel') setChannelMuted(entityId, muted);
      else setConversationMuted(entityId, muted);
    },
    [type, entityId, setChannelMuted, setConversationMuted],
  );

  // Fetch initial status on mount
  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const response =
          type === 'channel'
            ? await muteApi.getChannelMuteStatus(entityId)
            : await muteApi.getConversationMuteStatus(entityId);
        if (mounted && response.success) {
          setIsMuted(response.data.isMuted);
          updateStore(response.data.isMuted);
        }
      } catch {
        // Non-critical, default to unmuted
      }
    };
    fetchStatus();
    return () => {
      mounted = false;
    };
  }, [entityId, type, updateStore]);

  const handleToggleMute = useCallback(async () => {
    if (isMuteLoading) return;
    const newMuted = !isMuted;

    // Optimistic update
    setIsMuted(newMuted);
    updateStore(newMuted);
    setIsMuteLoading(true);

    try {
      const response =
        type === 'channel'
          ? await muteApi.toggleChannelMute(entityId, newMuted)
          : await muteApi.toggleConversationMute(entityId, newMuted);
      if (response.success) {
        setIsMuted(response.data.isMuted);
        updateStore(response.data.isMuted);
      }
    } catch {
      // Revert
      setIsMuted(!newMuted);
      updateStore(!newMuted);
      Alert.alert('Error', 'Failed to update mute setting');
    } finally {
      setIsMuteLoading(false);
    }
  }, [entityId, type, isMuted, isMuteLoading, updateStore]);

  return { isMuted, isMuteLoading, handleToggleMute };
}
