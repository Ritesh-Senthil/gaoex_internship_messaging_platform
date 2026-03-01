/**
 * SwipeableMessage Component
 * Wraps a message row to add swipe-right-to-reply gesture
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, spacing } from '../constants/theme';

interface SwipeableMessageProps {
  children: React.ReactNode;
  onSwipeReply: () => void;
  enabled?: boolean;
}

export default function SwipeableMessage({
  children,
  onSwipeReply,
  enabled = true,
}: SwipeableMessageProps) {
  const swipeableRef = useRef<Swipeable>(null);

  if (!enabled) {
    return <>{children}</>;
  }

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [0, 60],
      outputRange: [0.5, 1],
      extrapolate: 'clamp',
    });
    const opacity = dragX.interpolate({
      inputRange: [0, 40, 60],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.leftAction, { opacity }]}>
        <Animated.Text style={[styles.replyIcon, { transform: [{ scale }] }]}>
          ↩️
        </Animated.Text>
      </Animated.View>
    );
  };

  const handleSwipeOpen = () => {
    // Close the swipeable and trigger reply
    swipeableRef.current?.close();
    onSwipeReply();
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') {
          handleSwipeOpen();
        }
      }}
      leftThreshold={60}
      overshootLeft={false}
      friction={2}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  leftAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    paddingLeft: spacing.md,
  },
  replyIcon: {
    fontSize: 22,
  },
});
