/**
 * Channel Screen
 * Displays messages in a channel (placeholder for now)
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../types';

type RouteProps = RouteProp<RootStackParamList, 'Channel'>;

export default function ChannelScreen() {
  const route = useRoute<RouteProps>();
  const { channelId, channelName } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.emoji}>💬</Text>
        <Text style={styles.title}>#{channelName}</Text>
        <Text style={styles.subtitle}>Messages coming soon!</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            This is where messages will appear.{'\n'}
            Phase 2 will implement the messaging UI.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  infoBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    maxWidth: 300,
  },
  infoText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
