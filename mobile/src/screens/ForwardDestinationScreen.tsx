/**
 * ForwardDestinationScreen
 * Pick a channel or DM to forward a message into.
 * Server filters destinations to places the user can actually post.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import {
  RootStackParamList,
  ForwardDestinationChannel,
  ForwardDestinationConversation,
  ForwardDestinationProgram,
} from '../types';
import { forwardApi } from '../services/api';
import UserAvatar from '../components/UserAvatar';

type RouteProps = RouteProp<RootStackParamList, 'ForwardDestination'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type DestinationRow =
  | { kind: 'conversation'; data: ForwardDestinationConversation }
  | { kind: 'channel'; data: ForwardDestinationChannel };

type Section = {
  title: string;
  data: DestinationRow[];
};

export default function ForwardDestinationScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const {
    messageId,
    sourceChannelId,
    sourceConversationId,
    previewText,
    previewAuthor,
    hasAttachments,
  } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [programs, setPrograms] = useState<ForwardDestinationProgram[]>([]);
  const [conversations, setConversations] = useState<ForwardDestinationConversation[]>([]);
  const [forwardingId, setForwardingId] = useState<string | null>(null);

  // Simpler state typing
  const loadDestinations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await forwardApi.getDestinations({
        excludeChannelId: sourceChannelId,
        excludeConversationId: sourceConversationId,
      });
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Failed to load destinations');
      }
      setPrograms(res.data.programs);
      setConversations(res.data.conversations);
    } catch (err: any) {
      setError(err.message || 'Failed to load destinations');
    } finally {
      setIsLoading(false);
    }
  }, [sourceChannelId, sourceConversationId]);

  useEffect(() => {
    loadDestinations();
  }, [loadDestinations]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const sections: Section[] = useMemo(() => {
    const result: Section[] = [];

    const filteredConversations = conversations.filter(c => {
      if (!normalizedQuery) return true;
      return c.name.toLowerCase().includes(normalizedQuery);
    });

    if (filteredConversations.length > 0) {
      result.push({
        title: 'Direct Messages',
        data: filteredConversations.map(c => ({ kind: 'conversation' as const, data: c })),
      });
    }

    for (const program of programs) {
      const filteredChannels = program.channels.filter(ch => {
        if (!normalizedQuery) return true;
        const haystack = `${ch.name} ${program.name} ${ch.categoryName || ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });

      if (filteredChannels.length > 0) {
        result.push({
          title: program.name,
          data: filteredChannels.map(ch => ({ kind: 'channel' as const, data: ch })),
        });
      }
    }

    return result;
  }, [conversations, programs, normalizedQuery]);

  const previewBody = useMemo(() => {
    const text = previewText.trim();
    if (text) return text.length > 120 ? text.substring(0, 117) + '...' : text;
    if (hasAttachments) return '📎 Attachment';
    return '(empty message)';
  }, [previewText, hasAttachments]);

  const handleForward = async (row: DestinationRow) => {
    const destId = row.kind === 'channel' ? row.data.id : row.data.id;
    const destType = row.kind;

    if (forwardingId) return;

    setForwardingId(destId);
    try {
      const res = await forwardApi.forwardMessage({
        messageId,
        destinationType: destType,
        destinationId: destId,
        comment: comment.trim() || undefined,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Forward failed');
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const dest = res.data.destination;
      const destLabel =
        dest.type === 'channel'
          ? `#${dest.channelName}`
          : dest.conversationName;

      Alert.alert('Message forwarded', `Sent to ${destLabel}`, [
        { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: 'View',
          onPress: () => {
            navigation.goBack();
            if (dest.type === 'channel') {
              navigation.navigate('Channel', {
                channelId: dest.channelId,
                channelName: dest.channelName,
                programId: dest.programId,
              });
            } else {
              navigation.navigate('Conversation', {
                conversationId: dest.conversationId,
                name: dest.conversationName,
              });
            }
          },
        },
      ]);
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not forward', err.message || 'Something went wrong. Please try again.');
    } finally {
      setForwardingId(null);
    }
  };

  const renderRow = ({ item }: { item: DestinationRow }) => {
    const isForwarding = forwardingId === item.data.id;

    if (item.kind === 'conversation') {
      const conv = item.data;
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleForward(item)}
          disabled={!!forwardingId}
          activeOpacity={0.7}
        >
          <UserAvatar
            name={conv.name}
            avatarUrl={conv.avatarUrl}
            size={36}
            style={styles.rowAvatar}
          />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>{conv.name}</Text>
            <Text style={styles.rowSubtitle}>{conv.isGroup ? 'Group' : 'Direct message'}</Text>
          </View>
          {isForwarding ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )}
        </TouchableOpacity>
      );
    }

    const ch = item.data;
    const iconName =
      ch.isPrivate ? 'lock-closed' :
      ch.type === 'ANNOUNCEMENT' ? 'megaphone-outline' :
      null;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleForward(item)}
        disabled={!!forwardingId}
        activeOpacity={0.7}
      >
        <View style={styles.channelIconWrap}>
          {iconName ? (
            <Ionicons name={iconName as any} size={16} color={colors.channelText} />
          ) : (
            <Text style={styles.channelHash}>#</Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{ch.name}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {ch.categoryName ? `${ch.categoryName} · ` : ''}{ch.programName}
          </Text>
        </View>
        {isForwarding ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Preview card */}
        <View style={styles.previewCard}>
          <View style={styles.previewAccent} />
          <View style={styles.previewBody}>
            <Text style={styles.previewLabel}>Forwarding</Text>
            <Text style={styles.previewAuthor}>{previewAuthor}</Text>
            <Text style={styles.previewText} numberOfLines={2}>{previewBody}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search channels and conversations"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* List */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadDestinations}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="chatbubbles-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No destinations found</Text>
            <Text style={styles.emptySubtitle}>
              {normalizedQuery
                ? 'Try a different search term'
                : "You don't have permission to post anywhere else"}
            </Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item.kind}-${item.data.id}-${index}`}
            renderItem={renderRow}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.sectionHeader}>{title}</Text>
            )}
            stickySectionHeadersEnabled
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Optional comment */}
        <View style={styles.commentBar}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment (optional)"
            placeholderTextColor={colors.textMuted}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  previewCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  previewAccent: { width: 3, backgroundColor: colors.primary },
  previewBody: { flex: 1, padding: spacing.sm },
  previewLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  previewAuthor: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  previewText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { marginRight: spacing.xs },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },

  listContent: { paddingBottom: spacing.md },
  sectionHeader: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowAvatar: { marginRight: 0 },
  rowBody: { flex: 1 },
  rowTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  rowSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  channelIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelHash: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.channelText,
  },

  commentBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  commentInput: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    maxHeight: 80,
    minHeight: 36,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  retryText: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },
  emptyTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
