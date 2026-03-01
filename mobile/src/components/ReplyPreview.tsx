/**
 * ReplyPreview
 * Compact bar displayed above the message input to show what the user
 * is replying to. Used in ThreadScreen to keep context visible even
 * when the parent message has scrolled off screen.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

interface ReplyPreviewProps {
  authorName: string;
  messagePreview: string;
  onDismiss?: () => void;
  visible: boolean;
}

export default function ReplyPreview({ authorName, messagePreview, onDismiss, visible }: ReplyPreviewProps) {
  if (!visible) {
    return (
      <View style={styles.collapsedContainer}>
        <Ionicons name="return-down-forward-outline" size={14} color={colors.primary} style={styles.collapsedIcon} />
        <Text style={styles.collapsedText} numberOfLines={1}>
          Replying to <Text style={styles.collapsedAuthor}>{authorName}</Text>
        </Text>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-up" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <Text style={styles.author} numberOfLines={1}>{authorName}</Text>
        <Text style={styles.preview} numberOfLines={1}>{messagePreview || '(attachment)'}</Text>
      </View>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    height: 48,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    height: '100%',
    backgroundColor: colors.primary,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  author: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  preview: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
  },
  dismiss: {
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  collapsedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  collapsedIcon: {
    marginRight: spacing.xs,
  },
  collapsedText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  collapsedAuthor: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
  },
});
