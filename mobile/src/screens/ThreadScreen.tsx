/**
 * Thread Screen
 * Displays a parent message and its thread replies with reply input.
 * Works for both channel and DM threads.
 *
 * Refactored: shared hooks for reactions + message actions,
 * unified MessageActions (no separate ReactionPicker).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Message, DMMessage } from '../types';
import { channelApi, conversationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  subscribeToChannelEvents,
  subscribeToConversationEvents,
} from '../services/socket';

// Shared hooks
import {
  useReactions,
  applyReactionAddedSingle,
  applyReactionRemovedSingle,
} from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useDraft } from '../hooks/useDraft';
import ConnectionBanner from '../components/ConnectionBanner';
import ScrollToBottomFAB from '../components/ScrollToBottomFAB';
import ReplyPreview from '../components/ReplyPreview';

// Shared components
import { ChatLoadingState } from '../components/ChatStates';
import MessageActions from '../components/MessageActions';
import MarkdownText from '../components/MarkdownText';
import ReactionBar from '../components/ReactionBar';
import MessageInput from '../components/MessageInput';
import UserAvatar from '../components/UserAvatar';
import { AttachmentList } from '../components/FileCard';
import { formatMessageTime } from '../utils/dateFormatters';

type RouteProps = RouteProp<RootStackParamList, 'Thread'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Unified message type for both channel and DM thread replies
interface ThreadMessage {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  isEdited: boolean;
  attachments: any[];
  reactions: any[];
  parentMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function normalizeChannelMessage(msg: Message): ThreadMessage {
  return {
    id: msg.id,
    content: msg.content,
    authorId: msg.authorId || msg.author?.id || '',
    authorName: msg.author?.displayName || '',
    authorAvatar: msg.author?.avatarUrl || null,
    isEdited: msg.isEdited,
    attachments: msg.attachments || [],
    reactions: msg.reactions || [],
    parentMessageId: msg.parentMessageId,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

function normalizeDMMessage(msg: DMMessage): ThreadMessage {
  return {
    id: msg.id,
    content: msg.content,
    authorId: msg.authorId,
    authorName: msg.authorName,
    authorAvatar: msg.authorAvatar,
    isEdited: msg.isEdited,
    attachments: msg.attachments || [],
    reactions: msg.reactions || [],
    parentMessageId: msg.parentMessageId,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

export default function ThreadScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { messageId, channelId, conversationId, channelName, conversationName } = route.params;
  const { user } = useAuthStore();

  const isChannelThread = !!channelId;

  const [parentMessage, setParentMessage] = useState<ThreadMessage | null>(null);
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const { messageText, setMessageText, clearDraft } = useDraft(`thread:${messageId}`);
  const [replyPreviewExpanded, setReplyPreviewExpanded] = useState(true);

  const flatListRef = useRef<FlatList>(null);
  const isNearBottom = useRef(true);
  const [showScrollFAB, setShowScrollFAB] = useState(false);

  // --- Shared hooks ---
  const { handleAddReaction, handleToggleReaction, applyReactionAdded, applyReactionRemoved } =
    useReactions(user?.id, user?.displayName);
  const { selectedMessage, showActions, openActions, closeActions } =
    useMessageActions<ThreadMessage>();

  // --- Header ---
  useEffect(() => {
    const subtitle = isChannelThread ? `#${channelName || 'channel'}` : conversationName || 'DM';
    navigation.setOptions({
      headerShown: true,
      headerStyle: { backgroundColor: colors.backgroundSecondary },
      headerTintColor: colors.text,
      headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text }}>Thread</Text>
          <Text style={{ fontSize: typography.fontSize.xs, color: colors.textMuted }}>{subtitle}</Text>
        </View>
      ),
    });
  }, [navigation, isChannelThread, channelName, conversationName]);

  // --- Fetch thread ---
  const fetchThread = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        if (!hasMore || isLoadingMore) return;
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      const beforeDate = loadMore && replies.length > 0 ? replies[0].createdAt : undefined;

      if (isChannelThread) {
        const response = await channelApi.getThreadReplies(messageId, { limit: 50, before: beforeDate });
        if (response.success) {
          const normalizedParent = normalizeChannelMessage(response.data.parentMessage);
          const normalizedReplies = response.data.replies.map(normalizeChannelMessage);
          if (!loadMore) { setParentMessage(normalizedParent); setReplies(normalizedReplies); }
          else { setReplies(prev => [...normalizedReplies, ...prev]); }
          setHasMore(response.data.hasMore);
        }
      } else if (conversationId) {
        const response = await conversationApi.getThreadReplies(conversationId, messageId, { limit: 50, before: beforeDate });
        if (response.success) {
          const normalizedParent = normalizeDMMessage(response.data.parentMessage);
          const normalizedReplies = response.data.replies.map(normalizeDMMessage);
          if (!loadMore) { setParentMessage(normalizedParent); setReplies(normalizedReplies); }
          else { setReplies(prev => [...normalizedReplies, ...prev]); }
          setHasMore(response.data.hasMore);
        }
      }
    } catch {
      Alert.alert('Error', 'Failed to load thread');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [messageId, channelId, conversationId, isChannelThread, hasMore, isLoadingMore, replies]);

  useEffect(() => { fetchThread(); }, [messageId]);

  // --- Socket events ---
  useEffect(() => {
    if (isChannelThread && channelId) {
      const unsubscribe = subscribeToChannelEvents({
        onNewMessage: (message: Message) => {
          if (message.parentMessageId === messageId && message.author.id !== user?.id) {
            const normalized = normalizeChannelMessage(message);
            setReplies(prev => prev.some(r => r.id === normalized.id) ? prev : [...prev, normalized]);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        },
        onMessageUpdated: (message: Message) => {
          const normalized = normalizeChannelMessage(message);
          if (message.id === messageId) setParentMessage(normalized);
          else setReplies(prev => prev.map(r => r.id === message.id ? normalized : r));
        },
        onMessageDeleted: (data: { messageId: string }) => {
          if (data.messageId === messageId) {
            Alert.alert('Message Deleted', 'The parent message has been deleted.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
          } else {
            setReplies(prev => prev.filter(r => r.id !== data.messageId));
          }
        },
        onReactionAdded: (data: any) => {
          if (data.user.id === user?.id) return;
          setParentMessage(prev => prev ? applyReactionAddedSingle(prev, data.messageId, data.emoji, data.user) : prev);
          applyReactionAdded(data, setReplies);
        },
        onReactionRemoved: (data: any) => {
          if (data.user.id === user?.id) return;
          setParentMessage(prev => prev ? applyReactionRemovedSingle(prev, data.messageId, data.emoji, data.user.id) : prev);
          applyReactionRemoved(data, setReplies);
        },
      });
      return () => unsubscribe();
    } else if (conversationId) {
      const unsubscribe = subscribeToConversationEvents({
        onNewDMMessage: (data) => {
          if (data.conversationId === conversationId && data.message.parentMessageId === messageId && data.message.authorId !== user?.id) {
            const normalized = normalizeDMMessage(data.message);
            setReplies(prev => prev.some(r => r.id === normalized.id) ? prev : [...prev, normalized]);
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        },
        onDMMessageUpdated: (data) => {
          if (data.conversationId === conversationId) {
            const normalized = normalizeDMMessage(data.message);
            if (data.message.id === messageId) setParentMessage(normalized);
            else setReplies(prev => prev.map(r => r.id === data.message.id ? normalized : r));
          }
        },
        onDMMessageDeleted: (data) => {
          if (data.conversationId === conversationId) {
            if (data.messageId === messageId) {
              Alert.alert('Message Deleted', 'The parent message has been deleted.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
            } else {
              setReplies(prev => prev.filter(r => r.id !== data.messageId));
            }
          }
        },
        onReactionAdded: (data: any) => {
          if (data.conversationId !== conversationId || data.user.id === user?.id) return;
          setParentMessage(prev => prev ? applyReactionAddedSingle(prev, data.messageId, data.emoji, data.user) : prev);
          applyReactionAdded(data, setReplies);
        },
        onReactionRemoved: (data: any) => {
          if (data.conversationId !== conversationId || data.user.id === user?.id) return;
          setParentMessage(prev => prev ? applyReactionRemovedSingle(prev, data.messageId, data.emoji, data.user.id) : prev);
          applyReactionRemoved(data, setReplies);
        },
      });
      return () => unsubscribe();
    }
  }, [messageId, channelId, conversationId, isChannelThread, user?.id, navigation, applyReactionAdded, applyReactionRemoved]);

  // --- Send reply ---
  const handleSendReply = async () => {
    const content = messageText.trim();
    if (!content || isSending) return;
    clearDraft();
    Keyboard.dismiss();
    setIsSending(true);

    try {
      if (isChannelThread && channelId) {
        const response = await channelApi.sendMessage(channelId, content, messageId);
        if (response.success) {
          const normalized = normalizeChannelMessage(response.data.message);
          setReplies(prev => prev.some(r => r.id === normalized.id) ? prev : [...prev, normalized]);
        }
      } else if (conversationId) {
        const response = await conversationApi.sendMessage(conversationId, content, messageId);
        if (response.success) {
          const normalized = normalizeDMMessage(response.data.message);
          setReplies(prev => prev.some(r => r.id === normalized.id) ? prev : [...prev, normalized]);
        }
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Error', 'Failed to send reply');
      setMessageText(content);
    } finally {
      setIsSending(false);
    }
  };

  // --- Delete ---
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      if (isChannelThread && channelId) await channelApi.deleteMessage(channelId, selectedMessage.id);
      else if (conversationId) await conversationApi.deleteMessage(conversationId, selectedMessage.id);
      if (selectedMessage.id === messageId) navigation.goBack();
      else setReplies(prev => prev.filter(r => r.id !== selectedMessage.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete message');
    }
    closeActions();
  };

  // --- Reaction helpers for parent + replies ---
  const handleToggleReactionThread = async (msgId: string, emoji: string, hasReacted: boolean) => {
    // Optimistic update for parent
    if (parentMessage && parentMessage.id === msgId) {
      if (hasReacted) {
        setParentMessage(prev => prev ? applyReactionRemovedSingle(prev, msgId, emoji, user?.id || '') : prev);
      } else {
        setParentMessage(prev => prev ? applyReactionAddedSingle(prev, msgId, emoji, { id: user!.id, displayName: user!.displayName }) : prev);
      }
    }
    await handleToggleReaction(msgId, emoji, hasReacted, setReplies);
  };

  const handleAddReactionThread = async (msgId: string, emoji: string) => {
    if (parentMessage && parentMessage.id === msgId) {
      setParentMessage(prev => prev ? applyReactionAddedSingle(prev, msgId, emoji, { id: user!.id, displayName: user!.displayName }) : prev);
    }
    await handleAddReaction(msgId, emoji, setReplies);
  };

  // --- Render ---
  const renderParentMessage = () => {
    if (!parentMessage) return null;
    return (
      <TouchableOpacity style={styles.parentContainer} onLongPress={() => openActions(parentMessage)} delayLongPress={300} activeOpacity={0.8}>
        <View style={styles.parentHeader}>
          <UserAvatar name={parentMessage.authorName} avatarUrl={parentMessage.authorAvatar} size={40} style={{ marginRight: spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.parentAuthorName}>{parentMessage.authorName}</Text>
            <Text style={styles.parentTimestamp}>{formatMessageTime(parentMessage.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.parentContent}>
          {parentMessage.content ? <MarkdownText style={styles.parentText}>{parentMessage.content}</MarkdownText> : null}
          {parentMessage.attachments.length > 0 && <AttachmentList attachments={parentMessage.attachments} />}
          {parentMessage.isEdited && <Text style={styles.editedLabel}>(edited)</Text>}
          {parentMessage.reactions.length > 0 && (
            <ReactionBar
              reactions={parentMessage.reactions}
              currentUserId={user?.id}
              onReactionPress={(emoji, hasReacted) => handleToggleReactionThread(parentMessage.id, emoji, hasReacted)}
              onAddReaction={() => openActions(parentMessage)}
            />
          )}
        </View>
        <View style={styles.replySeparator}>
          <View style={styles.replySeparatorLine} />
          <Text style={styles.replySeparatorText}>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</Text>
          <View style={styles.replySeparatorLine} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderReply = ({ item }: { item: ThreadMessage }) => (
    <TouchableOpacity style={styles.replyContainer} onLongPress={() => openActions(item)} delayLongPress={300} activeOpacity={0.8}>
      <UserAvatar name={item.authorName} avatarUrl={item.authorAvatar} size={32} style={{ marginRight: spacing.sm, marginTop: 2 }} />
      <View style={styles.replyContent}>
        <View style={styles.replyHeader}>
          <Text style={styles.replyAuthorName}>{item.authorName}</Text>
          <Text style={styles.replyTimestamp}>{formatMessageTime(item.createdAt)}</Text>
        </View>
        {item.content ? <MarkdownText style={styles.replyText}>{item.content}</MarkdownText> : null}
        {item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}
        {item.isEdited && <Text style={styles.editedLabel}>(edited)</Text>}
        {item.reactions.length > 0 && (
          <ReactionBar
            reactions={item.reactions}
            currentUserId={user?.id}
            onReactionPress={(emoji, hasReacted) => handleToggleReactionThread(item.id, emoji, hasReacted)}
            onAddReaction={() => openActions(item)}
          />
        )}
      </View>
    </TouchableOpacity>
  );

  if (isLoading) return <ChatLoadingState />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ConnectionBanner />
        <FlatList
          ref={flatListRef}
          data={replies}
          keyExtractor={item => item.id}
          renderItem={renderReply}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {renderParentMessage()}
              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={() => fetchThread(true)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load earlier replies</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          }
          ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyText}>No replies yet. Be the first to reply!</Text></View>}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            const nearBottom = distanceFromBottom < 200;
            isNearBottom.current = nearBottom;
            setShowScrollFAB(!nearBottom);
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (replies.length > 0 && !isLoadingMore && isNearBottom.current) flatListRef.current?.scrollToEnd({ animated: false });
          }}
        />

        <ScrollToBottomFAB
          visible={showScrollFAB}
          newMessageCount={0}
          onPress={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
            setShowScrollFAB(false);
          }}
        />

        {/* Reply context preview */}
        {parentMessage && (
          <ReplyPreview
            authorName={parentMessage.authorName}
            messagePreview={parentMessage.content}
            visible={replyPreviewExpanded}
            onDismiss={() => setReplyPreviewExpanded((v) => !v)}
          />
        )}

        {/* Reply input */}
        <View style={styles.inputWrapper}>
          <View style={styles.inputFlex}>
            <MessageInput
              value={messageText}
              onChangeText={setMessageText}
              onSend={handleSendReply}
              placeholder="Reply..."
              isSending={isSending}
              users={[]}
              roles={[]}
              includeSpecialMentions={false}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Unified Message Actions — no edit support in threads */}
      <MessageActions
        visible={showActions}
        onClose={closeActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.authorId === user?.id}
        onDelete={handleDeleteMessage}
        onQuickReact={(emoji) => {
          if (selectedMessage) handleAddReactionThread(selectedMessage.id, emoji);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardAvoid: { flex: 1 },
  listContent: { paddingBottom: spacing.md },

  // Parent message
  parentContainer: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  parentHeader: { flexDirection: 'row', alignItems: 'center' },
  parentAuthorName: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text },
  parentTimestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 1 },
  parentContent: { marginLeft: 48, marginTop: spacing.xs },
  parentText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 22 },
  editedLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },

  // Reply separator
  replySeparator: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xs },
  replySeparatorLine: { flex: 1, height: 1, backgroundColor: colors.border },
  replySeparatorText: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginHorizontal: spacing.sm, fontWeight: typography.fontWeight.medium },

  // Replies
  replyContainer: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  replyContent: { flex: 1 },
  replyHeader: { flexDirection: 'row', alignItems: 'baseline' },
  replyAuthorName: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text, marginRight: spacing.sm },
  replyTimestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted },
  replyText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 22, marginTop: 2 },

  // Load more
  loadMoreButton: { alignItems: 'center', paddingVertical: spacing.sm },
  loadMoreText: { fontSize: typography.fontSize.sm, color: colors.primary, fontWeight: typography.fontWeight.medium },

  // Empty
  emptyContainer: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { fontSize: typography.fontSize.md, color: colors.textMuted, textAlign: 'center' },

  // Input
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  inputFlex: { flex: 1 },
});
