/**
 * ReactionBar Component
 * Displays reactions under a message with counts
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

export interface Reaction {
  emoji: string;
  count: number;
  users: { id: string; displayName: string }[];
  hasReacted?: boolean;
}

interface ReactionBarProps {
  reactions: Reaction[];
  currentUserId?: string;
  onReactionPress?: (emoji: string, hasReacted: boolean) => void;
  onAddReaction?: () => void;
}

export default function ReactionBar({
  reactions,
  currentUserId,
  onReactionPress,
  onAddReaction,
}: ReactionBarProps) {
  if (reactions.length === 0 && !onAddReaction) return null;

  const getHasReacted = (reaction: Reaction) => {
    if (reaction.hasReacted !== undefined) return reaction.hasReacted;
    if (!currentUserId || !reaction.users) return false;
    return reaction.users.some(u => u.id === currentUserId);
  };

  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {reactions.map((reaction) => {
        const hasReacted = getHasReacted(reaction);
        return (
          <TouchableOpacity
            key={reaction.emoji}
            style={[styles.reactionButton, hasReacted && styles.reactionButtonActive]}
            onPress={() => onReactionPress?.(reaction.emoji, hasReacted)}
            activeOpacity={0.7}
          >
            <Text style={styles.emoji}>{reaction.emoji}</Text>
            <Text style={[styles.count, hasReacted && styles.countActive]}>
              {reaction.count}
            </Text>
          </TouchableOpacity>
        );
      })}
      
      {onAddReaction && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddReaction}
          activeOpacity={0.7}
        >
          <Text style={styles.addIcon}>+</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactionButtonActive: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
  },
  emoji: {
    fontSize: 14,
    marginRight: 4,
  },
  count: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.medium,
  },
  countActive: {
    color: colors.primary,
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addIcon: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
  },
});
