/**
 * ReactionBar Component
 * Displays reactions under a message with counts.
 * Adapts colors for own-message (blue) vs other-message (dark) bubbles.
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
  /** When true, uses light colors suited for the blue own-message bubble */
  isOwnMessage?: boolean;
}

export default function ReactionBar({
  reactions,
  currentUserId,
  onReactionPress,
  onAddReaction,
  isOwnMessage = false,
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
            style={[
              styles.reactionButton,
              isOwnMessage && styles.reactionButtonOwn,
              hasReacted && (isOwnMessage ? styles.reactionButtonActiveOwn : styles.reactionButtonActive),
            ]}
            onPress={() => onReactionPress?.(reaction.emoji, hasReacted)}
            activeOpacity={0.7}
          >
            <Text style={styles.emoji}>{reaction.emoji}</Text>
            <Text style={[
              styles.count,
              isOwnMessage && styles.countOwn,
              hasReacted && (isOwnMessage ? styles.countActiveOwn : styles.countActive),
            ]}>
              {reaction.count}
            </Text>
          </TouchableOpacity>
        );
      })}
      
      {onAddReaction && (
        <TouchableOpacity
          style={[styles.addButton, isOwnMessage && styles.addButtonOwn]}
          onPress={onAddReaction}
          activeOpacity={0.7}
        >
          <Text style={[styles.addIcon, isOwnMessage && styles.addIconOwn]}>+</Text>
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

  // ── Default (dark bubble) ──
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
  count: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.medium,
  },
  countActive: {
    color: colors.primary,
  },

  // ── Own message (blue bubble) ──
  reactionButtonOwn: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  reactionButtonActiveOwn: {
    backgroundColor: 'rgba(255, 255, 255, 0.30)',
    borderColor: colors.white,
  },
  countOwn: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  countActiveOwn: {
    color: colors.white,
  },

  // ── Shared ──
  emoji: {
    fontSize: 14,
    marginRight: 4,
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
  addButtonOwn: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  addIcon: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.bold,
  },
  addIconOwn: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
});
