/**
 * ScrollToBottomFAB
 * Floating button that appears when the user scrolls up in a chat.
 * Shows a red badge with the count of new messages received while scrolled up.
 */

import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

interface ScrollToBottomFABProps {
  visible: boolean;
  newMessageCount: number;
  onPress: () => void;
}

export default function ScrollToBottomFAB({ visible, newMessageCount, onPress }: ScrollToBottomFABProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrapper, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.8}>
        <Ionicons name="chevron-down" size={22} color={colors.white} />
        {newMessageCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {newMessageCount > 99 ? '99+' : newMessageCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.md,
    zIndex: 10,
  },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
});
