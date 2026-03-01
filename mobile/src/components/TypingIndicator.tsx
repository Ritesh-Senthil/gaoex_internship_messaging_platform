/**
 * TypingIndicator Component
 * Shows who is currently typing in a conversation.
 * Displays small avatars, names (up to 2, then "and X others"),
 * and an animated "•••" dots indicator.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import UserAvatar from './UserAvatar';

export interface TypingUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface TypingIndicatorProps {
  /** Array of users currently typing */
  typingUsers: TypingUser[];
}

function AnimatedDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(200, [
        Animated.sequence([
          Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot1, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [dot1, dot2, dot3]);

  const dotStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }),
      },
    ],
  });

  return (
    <View style={styles.dotsContainer}>
      <Animated.Text style={[styles.dot, dotStyle(dot1)]}>•</Animated.Text>
      <Animated.Text style={[styles.dot, dotStyle(dot2)]}>•</Animated.Text>
      <Animated.Text style={[styles.dot, dotStyle(dot3)]}>•</Animated.Text>
    </View>
  );
}

function getTypingText(users: TypingUser[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) {
    return `${users[0].displayName} is typing`;
  }
  if (users.length === 2) {
    return `${users[0].displayName} and ${users[1].displayName} are typing`;
  }
  // 3 or more
  return `${users[0].displayName}, ${users[1].displayName} and ${users.length - 2} other${users.length - 2 > 1 ? 's' : ''} are typing`;
}

export default function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null;

  const text = getTypingText(typingUsers);

  return (
    <View style={styles.container}>
      <View style={styles.avatarsRow}>
        {typingUsers.slice(0, 3).map((u, i) => (
          <View
            key={u.userId}
            style={[styles.avatarWrapper, i > 0 && { marginLeft: -6 }]}
          >
            <UserAvatar
              name={u.displayName}
              avatarUrl={u.avatarUrl}
              size={18}
            />
          </View>
        ))}
      </View>
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
      <AnimatedDots />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 24,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: colors.background,
    borderRadius: 999,
  },
  text: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    flexShrink: 1,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
  },
  dot: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginHorizontal: 0.5,
  },
});
