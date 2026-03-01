/**
 * Channel Screen
 * Displays messages in a channel with send functionality.
 *
 * Refactored: shared hooks for reactions, highlights, attachments, mute, edit,
 * actions; shared components for loading/error states, thread indicator.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Message } from '../types';
import { channelApi, programApi, roleApi, uploadApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore } from '../store/unreadStore';
import {
  joinChannel,
  leaveChannel,
  joinProgram,
  leaveProgram,
  subscribeToChannelEvents,
  subscribeToChannelCategoryEvents,
  ChannelEventData,
  ChannelDeletedEventData,
  ThreadReplyAddedData,
  MessagePinnedData,
  MessageUnpinnedData,
} from '../services/socket';

// Shared hooks
import { useReactions } from '../hooks/useReactions';
import { useMessageActions } from '../hooks/useMessageActions';
import { useMessageHighlight } from '../hooks/useMessageHighlight';
import { useAttachments } from '../hooks/useAttachments';
import { useMute } from '../hooks/useMute';
import { useMessageEdit } from '../hooks/useMessageEdit';
import { useDraft } from '../hooks/useDraft';

// Shared components
import { ChatLoadingState, ChatErrorState } from '../components/ChatStates';
import ThreadIndicator from '../components/ThreadIndicator';
import MessageActions from '../components/MessageActions';
import MarkdownText from '../components/MarkdownText';
import ReactionBar from '../components/ReactionBar';
import MessageInput from '../components/MessageInput';
import { MentionUser, MentionRole } from '../components/MentionAutocomplete';
import AttachmentPicker from '../components/AttachmentPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import { AttachmentList } from '../components/FileCard';
import UserAvatar from '../components/UserAvatar';
import SwipeableMessage from '../components/SwipeableMessage';
import ConnectionBanner from '../components/ConnectionBanner';
import ScrollToBottomFAB from '../components/ScrollToBottomFAB';
import { formatMessageTime, formatDateHeader, shouldShowDateHeader } from '../utils/dateFormatters';

type RouteProps = RouteProp<RootStackParamList, 'Channel'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChannelScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { channelId, channelName, programId, highlightMessageId } = route.params;
  const { user } = useAuthStore();
  const { markChannelRead } = useUnreadStore();

  // --- Message state ---
  const [currentChannelName, setCurrentChannelName] = useState(channelName);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messageText, setMessageText, clearDraft } = useDraft(`channel:${channelId}`);

  // Channel permission state
  const [canPost, setCanPost] = useState(true);
  const [canManageMessages, setCanManageMessages] = useState(false);
  const [channelType, setChannelType] = useState<'TEXT' | 'ANNOUNCEMENT'>('TEXT');

  // Mention autocomplete state
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [mentionRoles, setMentionRoles] = useState<MentionRole[]>([]);

  // Tap-to-show timestamp (iMessage-style)
  const [tappedMessageId, setTappedMessageId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const isNearBottom = useRef(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showScrollFAB, setShowScrollFAB] = useState(false);

  // --- Shared hooks ---
  const { isMuted, isMuteLoading, handleToggleMute } = useMute('channel', channelId);
  const { handleAddReaction, handleToggleReaction, applyReactionAdded, applyReactionRemoved } =
    useReactions(user?.id, user?.displayName);
  const { selectedMessage, showActions, openActions, closeActions } =
    useMessageActions<Message>();
  const { editingMessage, editText, setEditText, inputRef, startEdit, cancelEdit, saveEdit } =
    useMessageEdit<Message>(channelApi.editMessage, channelId, setMessages);
  const {
    selectedFiles, showPicker, uploadProgress, isUploading,
    openPicker, closePicker, addFiles, removeFile, clearFiles,
    setUploadProgress, setIsUploading, resetUpload,
  } = useAttachments();
  const { highlightedId, highlightAnim, hasScrolledToHighlight } = useMessageHighlight({
    messages,
    flatListRef: flatListRef as React.RefObject<FlatList>,
    highlightMessageId,
    routeHighlightMessageId: route.params.highlightMessageId,
    isLoading,
  });

  // --- Header with pin + mute (Ionicons) ---
  useEffect(() => {
    navigation.setOptions({
      title: `#${currentChannelName}`,
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('PinnedMessages', { channelId, title: `#${currentChannelName}`, programId })}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Ionicons name="pin-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleToggleMute}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
            disabled={isMuteLoading}
          >
            <Ionicons
              name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
              size={22}
              color={colors.text}
              style={{ opacity: isMuteLoading ? 0.4 : 1 }}
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [currentChannelName, navigation, isMuted, isMuteLoading, handleToggleMute, channelId, programId]);

  // --- Fetch messages ---
  const fetchMessages = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        if (!hasMore || isLoadingMore) return;
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const options: { limit: number; before?: string } = { limit: 50 };
      if (loadMore && messages.length > 0) {
        options.before = messages[0].createdAt;
      }

      const response = await channelApi.getMessages(channelId, options);
      if (response.success) {
        if (loadMore) {
          setMessages(prev => [...response.data.messages, ...prev]);
        } else {
          setMessages(response.data.messages);
        }
        setHasMore(response.data.hasMore);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [channelId, hasMore, isLoadingMore, messages]);

  // --- Initial data load ---
  useEffect(() => {
    let isMounted = true;

    fetchMessages();

    // Fetch channel details for posting permissions
    (async () => {
      try {
        const response = await channelApi.getChannel(channelId);
        if (isMounted && response.success && response.data.channel) {
          setCanPost(response.data.channel.canPost ?? true);
          setCanManageMessages(response.data.channel.canManageMessages ?? false);
          setChannelType(response.data.channel.type || 'TEXT');
        }
      } catch {}
    })();

    // Mark channel as read
    markChannelRead(channelId);
    const markAsReadTimeout = setTimeout(async () => {
      if (!isMounted) return;
      try { await channelApi.markAsRead(channelId); } catch {}
    }, 500);

    return () => { isMounted = false; clearTimeout(markAsReadTimeout); };
  }, [channelId, markChannelRead]);

  // --- Fetch members + roles for mention autocomplete ---
  useEffect(() => {
    (async () => {
      try {
        const membersResponse = await programApi.getMembers(programId);
        if (membersResponse.success) {
          setMentionUsers(membersResponse.data.members.map((m: any) => ({
            id: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl,
          })));
        }
        const rolesResponse = await roleApi.getRoles(programId);
        if (rolesResponse.success) {
          setMentionRoles(rolesResponse.data.roles
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({ id: r.id, name: r.name, color: r.color || colors.primary })));
        }
      } catch {}
    })();
  }, [programId]);

  // --- Real-time socket subscriptions ---
  useEffect(() => {
    joinChannel(channelId);

    const unsubscribe = subscribeToChannelEvents({
      onNewMessage: (message: Message) => {
        if (message.channelId === channelId && message.author.id !== user?.id && !message.parentMessageId) {
          setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
          if (isNearBottom.current) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          } else {
            setNewMessageCount(c => c + 1);
          }
        }
      },
      onMessageUpdated: (message: Message) => {
        if (message.channelId === channelId) {
          setMessages(prev => prev.map(m => m.id === message.id ? message : m));
        }
      },
      onMessageDeleted: (data: { messageId: string; channelId: string }) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
      },
      onReactionAdded: (data: any) => {
        if (data.channelId === channelId) {
          applyReactionAdded(data, setMessages);
        }
      },
      onReactionRemoved: (data: any) => {
        if (data.channelId === channelId) {
          applyReactionRemoved(data, setMessages);
        }
      },
      onThreadReplyAdded: (data: ThreadReplyAddedData) => {
        setMessages(prev => prev.map(msg =>
          msg.id !== data.parentMessageId ? msg : {
            ...msg,
            replyCount: data.replyCount,
            lastReplyAt: data.lastReplyAt,
            latestReplyAuthors: data.latestReplyAuthors,
          },
        ));
      },
      onMessagePinned: (data: MessagePinnedData) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.map(msg =>
            msg.id === (data.message as Message).id ? { ...msg, isPinned: true } : msg,
          ));
        }
      },
      onMessageUnpinned: (data: MessageUnpinnedData) => {
        if (data.channelId === channelId) {
          setMessages(prev => prev.map(msg =>
            msg.id === data.messageId ? { ...msg, isPinned: false } : msg,
          ));
        }
      },
    });

    return () => { leaveChannel(channelId); unsubscribe(); };
  }, [channelId, user?.id, applyReactionAdded, applyReactionRemoved]);

  // Channel update / delete events
  useEffect(() => {
    joinProgram(programId);
    const unsubscribe = subscribeToChannelCategoryEvents({
      onChannelUpdated: (data: ChannelEventData) => {
        if (data.channel.id !== channelId) return;
        if (data.channel.name !== currentChannelName) {
          setCurrentChannelName(data.channel.name);
          navigation.setOptions({ title: `#${data.channel.name}` });
        }
      },
      onChannelDeleted: (data: ChannelDeletedEventData) => {
        if (data.channelId !== channelId) return;
        Alert.alert('Channel Deleted', 'This channel has been deleted.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      },
    });
    return () => { leaveProgram(programId); unsubscribe(); };
  }, [channelId, programId, currentChannelName, navigation]);

  // --- Send message ---
  const handleSendMessage = async () => {
    const content = messageText.trim();
    const hasFiles = selectedFiles.length > 0;
    if (!content && !hasFiles) return;
    if (isSending || isUploading) return;

    Keyboard.dismiss();

    try {
      if (hasFiles) {
        setIsUploading(true);
        setUploadProgress(0);
        const filesToUpload = selectedFiles.map(f => ({ uri: f.uri, name: f.name, type: f.type }));
        const response = await uploadApi.uploadToChannel(channelId, filesToUpload, content || undefined, (p) => setUploadProgress(p));
        if (response.success) {
          setMessages(prev => [...prev, response.data.message]);
          clearDraft();
          clearFiles();
        }
      } else {
        setIsSending(true);
        const response = await channelApi.sendMessage(channelId, content);
        if (response.success) {
          setMessages(prev => [...prev, response.data.message]);
          clearDraft();
        }
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
      resetUpload();
    }
  };

  // --- Delete + Pin ---
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await channelApi.deleteMessage(channelId, selectedMessage.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete message');
    }
    closeActions();
  };

  const handlePinMessage = async () => {
    if (!selectedMessage) return;
    const wasPinned = selectedMessage.isPinned;
    try {
      if (wasPinned) {
        await channelApi.unpinMessage(channelId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: false } : m));
      } else {
        await channelApi.pinMessage(channelId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: true } : m));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || `Failed to ${wasPinned ? 'unpin' : 'pin'} message`);
    }
    closeActions();
  };

  // --- Render message ---
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.author.id === user?.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showHeader = !prevMessage ||
      prevMessage.author.id !== item.author.id ||
      new Date(item.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000;

    const isEditing = editingMessage?.id === item.id;
    const isHighlighted = highlightedId === item.id;
    const showTimestamp = tappedMessageId === item.id;
    const showDate = shouldShowDateHeader(item.createdAt, prevMessage?.createdAt ?? null);
    const hasMetaBadges = item.isEdited || item.isPinned;

    const messageContent = (
      <>
        {showDate && (
          <View style={styles.dateHeader}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDateHeader(item.createdAt)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}

        <TouchableOpacity
          style={[styles.messageContainer, isEditing && styles.messageContainerEditing]}
          onPress={() => setTappedMessageId(prev => prev === item.id ? null : item.id)}
          onLongPress={() => openActions(item)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          {showHeader && (
            <View style={styles.messageHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (item.author.id !== user?.id) {
                    navigation.navigate('MemberProfile', { programId, userId: item.author.id, memberName: item.author.displayName });
                  }
                }}
                activeOpacity={0.7}
              >
                <UserAvatar name={item.author.displayName} avatarUrl={item.author.avatarUrl} size={36} style={{ marginRight: spacing.sm }} />
              </TouchableOpacity>
              <View style={styles.messageHeaderText}>
                <Text style={styles.authorName}>{item.author.displayName}</Text>
                {/* Inline timestamp (tap to reveal) */}
                {showTimestamp && (
                  <Text style={styles.timestamp}>
                    {formatMessageTime(item.createdAt)}
                    {item.isEdited && '  (edited)'}
                  </Text>
                )}
                {showTimestamp && item.isPinned && (
                  <Ionicons name="pin" size={11} color={colors.textMuted} style={{ marginLeft: 2 }} />
                )}
                {/* Compact meta badges (visible when timestamp hidden) */}
                {hasMetaBadges && !showTimestamp && (
                  <View style={styles.metaBadgeRow}>
                    {item.isEdited && <Text style={styles.metaBadge}>edited</Text>}
                    {item.isPinned && <Ionicons name="pin" size={10} color={colors.textMuted} style={{ marginLeft: 2 }} />}
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Timestamp for continuation messages (no header) */}
          {!showHeader && showTimestamp && (
            <View style={styles.timestampRowContinuation}>
              <Text style={styles.timestamp}>
                {formatMessageTime(item.createdAt, { includeDate: false })}
                {item.isEdited && '  (edited)'}
              </Text>
            </View>
          )}

          <View style={[styles.messageContent, !showHeader && styles.messageContentContinued]}>
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput
                  ref={inputRef}
                  style={styles.editInput}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEdit} style={styles.editButton}>
                    <Text style={styles.editButtonTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveEdit} style={[styles.editButton, styles.editButtonSave]}>
                    <Text style={styles.editButtonTextSave}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {item.content ? (
                  <MarkdownText
                    style={styles.messageText}
                    mentionedUsers={mentionUsers.map(u => u.displayName)}
                    mentionedRoles={mentionRoles.map(r => r.name)}
                    mentionEveryone
                  >
                    {item.content}
                  </MarkdownText>
                ) : null}
                {item.attachments && item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}
                {item.reactions && item.reactions.length > 0 && (
                  <ReactionBar
                    reactions={item.reactions}
                    currentUserId={user?.id}
                    onReactionPress={(emoji, hasReacted) => handleToggleReaction(item.id, emoji, hasReacted, setMessages)}
                    onAddReaction={() => openActions(item)}
                    isOwnMessage={isOwn}
                  />
                )}
                <ThreadIndicator
                  replyCount={item.replyCount ?? 0}
                  lastReplyAt={item.lastReplyAt}
                  latestReplyAuthors={item.latestReplyAuthors}
                  onPress={() => navigation.navigate('Thread', { messageId: item.id, channelId, channelName: currentChannelName })}
                />
              </>
            )}
          </View>
        </TouchableOpacity>
      </>
    );

    const handleSwipeReply = () => {
      navigation.navigate('Thread', { messageId: item.id, channelId, channelName: currentChannelName });
    };

    if (isHighlighted) {
      const backgroundColor = highlightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['transparent', colors.highlightBg],
      });
      return (
        <SwipeableMessage onSwipeReply={handleSwipeReply}>
          <Animated.View style={{ backgroundColor }}>{messageContent}</Animated.View>
        </SwipeableMessage>
      );
    }

    return (
      <SwipeableMessage onSwipeReply={handleSwipeReply}>
        {messageContent}
      </SwipeableMessage>
    );
  };

  // --- Loading / Error ---
  if (isLoading) return <ChatLoadingState />;
  if (error) return <ChatErrorState error={error} onRetry={() => fetchMessages()} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ConnectionBanner />
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          keyboardDismissMode="on-drag"
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Welcome to #{currentChannelName}</Text>
              <Text style={styles.emptySubtitle}>This is the beginning of the channel. Send the first message!</Text>
            </View>
          }
          ListHeaderComponent={isLoadingMore ? (
            <View style={styles.loadingMore}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : null}
          onEndReachedThreshold={0.5}
          onEndReached={() => {}}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            if (contentOffset.y < 50 && hasMore && !isLoadingMore) {
              fetchMessages(true);
            }
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            const nearBottom = distanceFromBottom < 200;
            isNearBottom.current = nearBottom;
            setShowScrollFAB(!nearBottom);
            if (nearBottom) {
              setNewMessageCount(0);
            }
          }}
          scrollEventThrottle={100}
          inverted={false}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          onContentSizeChange={() => {
            if ((route.params.highlightMessageId || highlightMessageId) && !hasScrolledToHighlight.current) return;
            if (messages.length > 0 && !isLoadingMore && isNearBottom.current) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        <ScrollToBottomFAB
          visible={showScrollFAB}
          newMessageCount={newMessageCount}
          onPress={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
            setNewMessageCount(0);
            setShowScrollFAB(false);
          }}
        />

        {/* Attachment Preview */}
        {selectedFiles.length > 0 && (
          <AttachmentPreview files={selectedFiles} onRemove={removeFile} isUploading={isUploading} uploadProgress={uploadProgress} />
        )}

        {/* Message Input */}
        {!editingMessage && (
          canPost ? (
            <View style={styles.inputWrapper}>
              <TouchableOpacity style={styles.attachButton} onPress={openPicker} disabled={isUploading}>
                <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
              <View style={styles.inputFlex}>
                <MessageInput
                  value={messageText}
                  onChangeText={setMessageText}
                  onSend={handleSendMessage}
                  placeholder={`Message #${channelName}`}
                  isSending={isSending || isUploading}
                  users={mentionUsers}
                  roles={mentionRoles}
                  includeSpecialMentions
                  canSendOverride={selectedFiles.length > 0 ? true : undefined}
                />
              </View>
            </View>
          ) : (
            <View style={styles.readOnlyBanner}>
              <Ionicons name="megaphone-outline" size={18} color={colors.warning} />
              <Text style={styles.readOnlyText}>Only administrators can post in announcement channels</Text>
            </View>
          )
        )}

        {/* Attachment Picker Modal */}
        <AttachmentPicker
          visible={showPicker}
          onClose={closePicker}
          onFilesSelected={addFiles}
          maxFiles={5}
          currentFileCount={selectedFiles.length}
        />
      </KeyboardAvoidingView>

      {/* Unified Message Actions (includes quick-react row) */}
      <MessageActions
        visible={showActions}
        onClose={closeActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.author.id === user?.id}
        canDelete={canManageMessages}
        isPinned={selectedMessage?.isPinned}
        onEdit={() => { if (selectedMessage) startEdit(selectedMessage); }}
        onDelete={handleDeleteMessage}
        onQuickReact={(emoji) => {
          if (selectedMessage) handleAddReaction(selectedMessage.id, emoji, setMessages);
        }}
        onPin={selectedMessage && !selectedMessage.parentMessageId ? handlePinMessage : undefined}
        onReply={selectedMessage ? () => {
          const msg = selectedMessage;
          closeActions();
          const threadMessageId = msg.parentMessageId || msg.id;
          navigation.navigate('Thread', { messageId: threadMessageId, channelId, channelName: currentChannelName });
        } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardAvoid: { flex: 1 },
  messageList: { paddingVertical: spacing.md },
  emptyList: { flex: 1 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text, marginBottom: spacing.sm },
  emptySubtitle: { fontSize: typography.fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  loadingMore: { padding: spacing.md, alignItems: 'center' },

  // Date header
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md, paddingHorizontal: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { marginHorizontal: spacing.md, fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium },

  // Message
  messageContainer: { paddingHorizontal: spacing.md, paddingVertical: 2 },
  messageContainerEditing: { backgroundColor: colors.primary + '10', borderLeftWidth: 3, borderLeftColor: colors.primary },
  messageHeader: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  messageHeaderText: { flexDirection: 'row', alignItems: 'baseline', flex: 1, flexWrap: 'wrap', gap: spacing.xs },
  authorName: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text },
  metaBadgeRow: { flexDirection: 'row', alignItems: 'center' },
  metaBadge: { fontSize: typography.fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  timestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted },
  timestampRowContinuation: { marginLeft: 44, marginBottom: 1 },
  messageContent: { marginLeft: 44, marginTop: 1 },
  messageContentContinued: { marginTop: 1 },
  messageText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 22 },

  // Edit
  editContainer: { flex: 1 },
  editInput: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: typography.fontSize.md, color: colors.text, minHeight: 40, maxHeight: 100 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs, gap: spacing.sm },
  editButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  editButtonSave: { backgroundColor: colors.primary },
  editButtonTextCancel: { color: colors.textMuted, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  editButtonTextSave: { color: colors.white, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },

  // Input area
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  attachButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs, marginBottom: spacing.xs },
  inputFlex: { flex: 1 },
  readOnlyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warning + '20', borderTopWidth: 1, borderTopColor: colors.warning + '50', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.sm },
  readOnlyText: { color: colors.warning, fontSize: typography.fontSize.sm, textAlign: 'center', fontWeight: typography.fontWeight.medium },
});
