/**
 * ConnectionBanner
 * Thin animated banner showing socket + server connection status.
 * Sits above the chat FlatList, below the nav header.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../constants/theme';
import { useConnectionStore, ConnectionStatus } from '../store/connectionStore';
import { fetchServerHealth } from '../services/health';

const BANNER_HEIGHT = 32;
const CONNECTED_DISPLAY_MS = 2000;
const HEALTH_POLL_MS = 5000;

type BannerMode = ConnectionStatus | 'server-unavailable' | 'server-waking';

export default function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const serverStatus = useConnectionStore((s) => s.serverStatus);
  const setServerOk = useConnectionStore((s) => s.setServerOk);
  const setServerWaking = useConnectionStore((s) => s.setServerWaking);
  const setServerUnavailable = useConnectionStore((s) => s.setServerUnavailable);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const [displayMode, setDisplayMode] = useState<BannerMode | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnce = useRef(false);

  // Poll /health when the API or database looks down (e.g. Supabase waking up).
  useEffect(() => {
    if (serverStatus === 'ok') return;

    let cancelled = false;

    const poll = async () => {
      const health = await fetchServerHealth();
      if (cancelled) return;

      if (!health.alive) {
        setServerUnavailable();
        return;
      }

      if (health.database === 'connected') {
        setServerOk();
        return;
      }

      setServerWaking();
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, HEALTH_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverStatus, setServerOk, setServerUnavailable, setServerWaking]);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    let nextMode: BannerMode | null = null;

    if (serverStatus === 'unavailable') {
      nextMode = 'server-unavailable';
    } else if (serverStatus === 'waking') {
      nextMode = 'server-waking';
    } else if (status === 'connected') {
      if (!hasConnectedOnce.current) {
        hasConnectedOnce.current = true;
        nextMode = null;
      } else {
        nextMode = 'connected';
        hideTimer.current = setTimeout(() => {
          Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
            setDisplayMode(null);
          });
        }, CONNECTED_DISPLAY_MS);
      }
    } else if (status === 'connecting' || status === 'disconnected') {
      nextMode = status;
    }

    setDisplayMode(nextMode);

    if (nextMode) {
      Animated.timing(slideAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [status, serverStatus, slideAnim]);

  if (!displayMode) return null;

  const heightInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT],
  });

  const opacityInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const bgColor =
    displayMode === 'connected' ? colors.success :
    displayMode === 'connecting' || displayMode === 'server-waking' ? colors.warning :
    colors.error;

  const textColor =
    displayMode === 'connecting' || displayMode === 'server-waking' ? colors.black : colors.white;

  const label =
    displayMode === 'connecting' ? 'Reconnecting...' :
    displayMode === 'disconnected' ? 'No connection' :
    displayMode === 'connected' ? 'Connected' :
    displayMode === 'server-waking' ? 'Server is starting up...' :
    'Cannot reach server';

  const iconName =
    displayMode === 'connected' ? 'checkmark-circle-outline' :
    displayMode === 'server-waking' ? 'time-outline' :
    displayMode === 'connecting' ? null :
    'cloud-offline-outline';

  return (
    <Animated.View
      style={[
        styles.container,
        { height: heightInterpolation, opacity: opacityInterpolation, backgroundColor: bgColor },
      ]}
    >
      <View style={styles.content}>
        {displayMode === 'connecting' && (
          <ActivityIndicator size="small" color={textColor} style={styles.icon} />
        )}
        {iconName && (
          <Ionicons name={iconName as any} size={14} color={textColor} style={styles.icon} />
        )}
        <Text style={[styles.text, { color: textColor }]}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  icon: {
    marginRight: spacing.xs,
  },
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
