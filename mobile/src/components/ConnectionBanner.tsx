/**
 * ConnectionBanner
 * Thin animated banner showing socket connection status.
 * Sits above the chat FlatList, below the nav header.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../constants/theme';
import { useConnectionStore, ConnectionStatus } from '../store/connectionStore';

const BANNER_HEIGHT = 32;
const CONNECTED_DISPLAY_MS = 2000;

export default function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [displayStatus, setDisplayStatus] = useState<ConnectionStatus | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnce = useRef(false);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (status === 'connected') {
      if (!hasConnectedOnce.current) {
        // First connect — don't show the green banner, just hide silently
        hasConnectedOnce.current = true;
        setDisplayStatus(null);
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
        return;
      }
      // Reconnected — flash green briefly
      setDisplayStatus('connected');
      Animated.timing(slideAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start(() => {
          setDisplayStatus(null);
        });
      }, CONNECTED_DISPLAY_MS);
    } else if (status === 'connecting' || status === 'disconnected') {
      setDisplayStatus(status);
      Animated.timing(slideAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [status, slideAnim]);

  if (!displayStatus) return null;

  const heightInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BANNER_HEIGHT],
  });

  const opacityInterpolation = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const bgColor =
    displayStatus === 'connected' ? colors.success :
    displayStatus === 'connecting' ? colors.warning :
    colors.error;

  const textColor =
    displayStatus === 'connecting' ? colors.black : colors.white;

  return (
    <Animated.View
      style={[
        styles.container,
        { height: heightInterpolation, opacity: opacityInterpolation, backgroundColor: bgColor },
      ]}
    >
      <View style={styles.content}>
        {displayStatus === 'connecting' && (
          <ActivityIndicator size="small" color={textColor} style={styles.icon} />
        )}
        {displayStatus === 'disconnected' && (
          <Ionicons name="cloud-offline-outline" size={14} color={textColor} style={styles.icon} />
        )}
        {displayStatus === 'connected' && (
          <Ionicons name="checkmark-circle-outline" size={14} color={textColor} style={styles.icon} />
        )}
        <Text style={[styles.text, { color: textColor }]}>
          {displayStatus === 'connecting' && 'Reconnecting...'}
          {displayStatus === 'disconnected' && 'No connection'}
          {displayStatus === 'connected' && 'Connected'}
        </Text>
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
