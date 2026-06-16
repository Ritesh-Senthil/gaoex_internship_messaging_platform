/**
 * Pinned Messages Screen
 * Displays all pinned messages in a channel or conversation.
 * Allows unpinning and navigating to messages in context.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Message, DMMessage } from '../types';
import { channelApi, conversationApi, programApi, roleApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  subscribeToChannelEvents,
  subscribeToConversationEvents,
  MessagePinnedData,
  MessageUnpinnedData,
} from '../services/socket';
import UserAvatar from '../components/UserAvatar';
import { Ionicons } from '@expo/vector-icons';
import MarkdownText from '../components/MarkdownText';
import { AttachmentList } from '../components/FileCard';

type RouteProps = RouteProp<RootStackParamList, 'PinnedMessages'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Unified pinned message type for display
interface PinnedMessage {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  isPinned: boolean;
  attachments: any[];
  createdAt: string;
}

export default function PinnedMessagesScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { channelId, conversationId, title, programId } = route.params;
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<PinnedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Program members/roles to resolve stable `<@id>` / `<@&id>` mention tokens
  // (PE-04) into `@DisplayName` highlights, sourced the same way ChannelScreen
  // does. Only channel pins (with a known program) carry tokens; DM pins don't.
  const [mentionUsers, setMentionUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [mentionRoles, setMentionRoles] = useState<{ id: string; name: string }[]>([]);

  const isChannel = !!channelId;

  // Set header title
  useEffect(() => {
    navigation.setOptions({
      title: `Pinned — ${title}`,
    });
  }, [title, navigation]);

  // Fetch pinned messages
  const fetchPinned = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isChannel && channelId) {
        const response = await channelApi.getPinnedMessages(channelId);
        if (response.success) {
          setMessages(response.data.messages.map((m: Message) => ({
            id: m.id,
            content: m.content,
            authorId: m.author.id,
            authorName: m.author.displayName,
            authorAvatar: m.author.avatarUrl,
            isPinned: m.isPinned,
            attachments: m.attachments || [],
            createdAt: m.createdAt,
          })));
        }
      } else if (conversationId) {
        const response = await conversationApi.getPinnedMessages(conversationId);
        if (response.success) {
          setMessages(response.data.messages.map((m: DMMessage) => ({
            id: m.id,
            content: m.content,
            authorId: m.authorId,
            authorName: m.authorName,
            authorAvatar: m.authorAvatar,
            isPinned: m.isPinned,
            attachments: m.attachments || [],
            createdAt: m.createdAt,
          })));
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load pinned messages');
    } finally {
      setIsLoading(false);
    }
  }, [channelId, conversationId, isChannel]);

  useEffect(() => {
    fetchPinned();
  }, [fetchPinned]);

  // Fetch members + roles to resolve mention tokens (PE-04b) for channel pins.
  useEffect(() => {
    if (!isChannel || !programId) return;
    let isMounted = true;
    (async () => {
      try {
        const membersResponse = await programApi.getMembers(programId);
        if (isMounted && membersResponse.success) {
          setMentionUsers(membersResponse.data.members.map((m: any) => ({
            id: m.userId, displayName: m.displayName,
          })));
        }
        const rolesResponse = await roleApi.getRoles(programId);
        if (isMounted && rolesResponse.success) {
          setMentionRoles(rolesResponse.data.roles
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({ id: r.id, name: r.name })));
        }
      } catch {}
    })();
    return () => { isMounted = false; };
  }, [isChannel, programId]);

  // Real-time updates: listen for pin/unpin events
  useEffect(() => {
    if (isChannel && channelId) {
      const unsubscribe = subscribeToChannelEvents({
        onMessagePinned: (data: MessagePinnedData) => {
          if (data.channelId === channelId) {
            const msg = data.message as Message;
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [{
                id: msg.id,
                content: msg.content,
                authorId: msg.author.id,
                authorName: msg.author.displayName,
                authorAvatar: msg.author.avatarUrl,
                isPinned: true,
                attachments: msg.attachments || [],
                createdAt: msg.createdAt,
              }, ...prev];
            });
          }
        },
        onMessageUnpinned: (data: MessageUnpinnedData) => {
          if (data.channelId === channelId) {
            setMessages(prev => prev.filter(m => m.id !== data.messageId));
          }
        },
      });
      return unsubscribe;
    } else if (conversationId) {
      const unsubscribe = subscribeToConversationEvents({
        onMessagePinned: (data: MessagePinnedData) => {
          if (data.conversationId === conversationId) {
            const msg = data.message as any;
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [{
                id: msg.id,
                content: msg.content,
                authorId: msg.authorId || msg.author?.id,
                authorName: msg.authorName || msg.author?.displayName,
                authorAvatar: msg.authorAvatar || msg.author?.avatarUrl,
                isPinned: true,
                attachments: msg.attachments || [],
                createdAt: msg.createdAt,
              }, ...prev];
            });
          }
        },
        onMessageUnpinned: (data: MessageUnpinnedData) => {
          if (data.conversationId === conversationId) {
            setMessages(prev => prev.filter(m => m.id !== data.messageId));
          }
        },
      });
      return unsubscribe;
    }
  }, [channelId, conversationId, isChannel]);

  // Unpin a message
  const handleUnpin = useCallback(async (messageId: string) => {
    Alert.alert(
      'Unpin Message',
      'Are you sure you want to unpin this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpin',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isChannel && channelId) {
                await channelApi.unpinMessage(channelId, messageId);
              } else if (conversationId) {
                await conversationApi.unpinMessage(conversationId, messageId);
              }
              // Optimistically remove from local list
              setMessages(prev => prev.filter(m => m.id !== messageId));
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to unpin message');
            }
          },
        },
      ]
    );
  }, [channelId, conversationId, isChannel]);

  // Navigate to message in context — set highlightMessageId on the parent
  // Channel/Conversation screen, then pop back to it.
  const handleGoToMessage = useCallback((messageId: string) => {
    // Find the parent route key (the screen underneath PinnedMessages)
    const state = navigation.getState();
    const parentRoute = state.routes[state.routes.length - 2];

    if (parentRoute) {
      // Set highlightMessageId on the parent screen so it scrolls & highlights
      navigation.dispatch({
        ...CommonActions.setParams({ highlightMessageId: messageId }),
        source: parentRoute.key,
      });
    }

    navigation.goBack();
  }, [navigation]);

  // Format timestamp
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  // Render a pinned message
  const renderPinnedMessage = ({ item }: { item: PinnedMessage }) => (
    <View style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <UserAvatar
          name={item.authorName}
          avatarUrl={item.authorAvatar}
          size={36}
          style={{ marginRight: spacing.sm }}
        />
        <View style={styles.headerText}>
          <Text style={styles.authorName}>{item.authorName}</Text>
          <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleUnpin(item.id)}
          style={styles.unpinButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="pin-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.messageBody}
        onPress={() => handleGoToMessage(item.id)}
        activeOpacity={0.7}
      >
        {item.content ? (
          <MarkdownText
            style={styles.messageText}
            mentionUsers={mentionUsers}
            mentionRoles={mentionRoles}
          >
            {item.content}
          </MarkdownText>
        ) : null}
        {item.attachments && item.attachments.length > 0 && (
          <AttachmentList attachments={item.attachments} />
        )}
        <Text style={styles.goToMessage}>Tap to view in context →</Text>
      </TouchableOpacity>
    </View>
  );

  // Empty state
  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="pin-outline" size={48} color={colors.textMuted} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>No pinned messages</Text>
        <Text style={styles.emptySubtitle}>
          Long-press a message and tap "Pin Message" to pin it here.
        </Text>
      </View>
    );
  };

  if (error) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['bottom']}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchPinned} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderPinnedMessage}
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.list}
          ListEmptyComponent={renderEmpty}
          ListHeaderComponent={
            messages.length > 0 ? (
              <Text style={styles.countHeader}>
                {messages.length} pinned {messages.length === 1 ? 'message' : 'messages'}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingBottom: spacing.xl,
  },
  emptyList: {
    flexGrow: 1,
  },
  countHeader: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.medium,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  messageCard: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  headerText: {
    flex: 1,
  },
  authorName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  unpinButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBody: {
    padding: spacing.md,
  },
  messageText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  goToMessage: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  errorText: {
    fontSize: typography.fontSize.md,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryText: {
    fontSize: typography.fontSize.md,
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },
});
