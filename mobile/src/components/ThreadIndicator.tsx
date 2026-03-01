/**
 * ThreadIndicator — shared thread reply preview pill
 * Used by ChannelScreen and ConversationScreen message rendering.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import UserAvatar from './UserAvatar';
import { formatRelativeTime } from '../utils/dateFormatters';

interface ThreadAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface ThreadIndicatorProps {
  replyCount: number;
  lastReplyAt: string | null | undefined;
  latestReplyAuthors: ThreadAuthor[] | undefined;
  onPress: () => void;
}

export default function ThreadIndicator({
  replyCount,
  lastReplyAt,
  latestReplyAuthors,
  onPress,
}: ThreadIndicatorProps) {
  if (replyCount <= 0) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatars}>
        {(latestReplyAuthors || []).map((author, i) => (
          <View
            key={author.id}
            style={[
              styles.avatarWrapper,
              { marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i },
            ]}
          >
            <UserAvatar
              name={author.displayName}
              avatarUrl={author.avatarUrl}
              size={20}
            />
          </View>
        ))}
      </View>
      <Text style={styles.replyCount}>
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </Text>
      {lastReplyAt && (
        <Text style={styles.lastReply}>{formatRelativeTime(lastReplyAt)}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  avatars: {
    flexDirection: 'row',
    marginRight: spacing.xs,
  },
  avatarWrapper: {
    borderWidth: 1.5,
    borderColor: colors.background,
    borderRadius: 10,
  },
  replyCount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginRight: spacing.xs,
  },
  lastReply: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
});
