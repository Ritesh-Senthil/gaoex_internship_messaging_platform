/**
 * Conversation Screen
 * Displays messages in a DM conversation with send functionality.
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
import { RootStackParamList, DMMessage } from '../types';
import { conversationApi, uploadApi, userApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useUnreadStore } from '../store/unreadStore';
import {
  joinConversation,
  leaveConversation,
  subscribeToConversationEvents,
  subscribeToGroupEvents,
  sendDMTypingStart,
  sendDMTypingStop,
  GroupUpdatedEventData,
  GroupParticipantAddedEventData,
  GroupParticipantLeftEventData,
  ThreadReplyAddedData,
  MessagePinnedData,
  MessageUnpinnedData,
  TypingEventData,
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
import { MentionUser } from '../components/MentionAutocomplete';
import AttachmentPicker from '../components/AttachmentPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import { AttachmentList } from '../components/FileCard';
import UserAvatar from '../components/UserAvatar';
import SwipeableMessage from '../components/SwipeableMessage';
import ConnectionBanner from '../components/ConnectionBanner';
import ScrollToBottomFAB from '../components/ScrollToBottomFAB';
import TypingIndicator, { TypingUser } from '../components/TypingIndicator';
import { formatMessageTime, formatDateHeader, shouldShowDateHeader } from '../utils/dateFormatters';

type RouteProps = RouteProp<RootStackParamList, 'Conversation'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { conversationId, name: initialName, highlightMessageId } = route.params;
  const { user } = useAuthStore();
  const { markConversationRead } = useUnreadStore();

  // --- Message state ---
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { messageText, setMessageText, clearDraft } = useDraft(`conversation:${conversationId}`);

  // Group state
  const [isGroup, setIsGroup] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [displayName, setDisplayName] = useState(initialName);

  // Mention autocomplete
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isTypingRef = useRef(false);
  const typingEmitTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tap-to-show timestamp (iMessage-style)
  const [tappedMessageId, setTappedMessageId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const isNearBottom = useRef(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [showScrollFAB, setShowScrollFAB] = useState(false);

  // --- Shared hooks ---
  const { isMuted, isMuteLoading, handleToggleMute } = useMute('conversation', conversationId);
  const { handleAddReaction, handleToggleReaction, applyReactionAdded, applyReactionRemoved } =
    useReactions(user?.id, user?.displayName);
  const { selectedMessage, showActions, openActions, closeActions } =
    useMessageActions<DMMessage>();
  const { editingMessage, editText, setEditText, inputRef, startEdit, cancelEdit, saveEdit } =
    useMessageEdit<DMMessage>(conversationApi.editMessage, conversationId, setMessages);
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

  // --- Navigate to Group Info ---
  const handleGroupInfoPress = useCallback(() => {
    navigation.navigate('GroupInfo', { conversationId, groupName: displayName });
  }, [navigation, conversationId, displayName]);

  // --- Header ---
  useEffect(() => {
    navigation.setOptions({
      title: displayName,
      headerTitle: isGroup
        ? () => (
            <TouchableOpacity onPress={handleGroupInfoPress} activeOpacity={0.7} style={headerStyles.titleContainer}>
              <Text style={headerStyles.titleText} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={headerStyles.subtitleText}>
                {participantCount} members
              </Text>
            </TouchableOpacity>
          )
        : undefined,
      headerRight: () => (
        <View style={headerStyles.rightContainer}>
          <TouchableOpacity
            onPress={() => navigation.navigate('PinnedMessages', { conversationId, title: displayName })}
            style={headerStyles.iconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="pin-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          {isGroup ? (
            <TouchableOpacity
              onPress={handleGroupInfoPress}
              style={headerStyles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleToggleMute}
              style={headerStyles.iconButton}
              disabled={isMuteLoading}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
                size={22}
                color={colors.text}
                style={{ opacity: isMuteLoading ? 0.4 : 1 }}
              />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [displayName, navigation, isMuted, isMuteLoading, handleToggleMute, isGroup, participantCount, handleGroupInfoPress, conversationId]);

  // --- Fetch messages ---
  const fetchMessages = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      const beforeDate = loadMore && messages.length > 0 ? messages[0].createdAt : undefined;
      const response = await conversationApi.getMessages(conversationId, 50, beforeDate);
      if (response.success) {
        if (loadMore) {
          setMessages(prev => [...response.data.messages, ...prev]);
        } else {
          setMessages(response.data.messages);
        }
        setHasMore(response.data.hasMore);
      }
    } catch (err: any) {
      if (!loadMore) setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId, messages]);

  // --- Initial load + socket join ---
  useEffect(() => {
    let isMounted = true;

    fetchMessages();
    joinConversation(conversationId);

    markConversationRead(conversationId);
    const markAsReadTimeout = setTimeout(async () => {
      if (!isMounted) return;
      try { await conversationApi.markAsRead(conversationId); } catch {}
    }, 500);

    // Subscribe to real-time events
    const unsubscribe = subscribeToConversationEvents({
      onNewDMMessage: (data) => {
        if (data.conversationId === conversationId && !data.message.parentMessageId) {
          setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
          if (isNearBottom.current) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          } else {
            setNewMessageCount(c => c + 1);
          }
        }
      },
      onDMMessageUpdated: (data) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(m => m.id === data.message.id ? data.message : m));
        }
      },
      onDMMessageDeleted: (data) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.filter(m => m.id !== data.messageId));
        }
      },
      onReactionAdded: (data: any) => {
        if (data.conversationId === conversationId) applyReactionAdded(data, setMessages);
      },
      onReactionRemoved: (data: any) => {
        if (data.conversationId === conversationId) applyReactionRemoved(data, setMessages);
      },
      onThreadReplyAdded: (data: ThreadReplyAddedData) => {
        setMessages(prev => prev.map(msg =>
          msg.id !== data.parentMessageId ? msg : {
            ...msg, replyCount: data.replyCount, lastReplyAt: data.lastReplyAt, latestReplyAuthors: data.latestReplyAuthors,
          },
        ));
      },
      onMessagePinned: (data: MessagePinnedData) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(msg => msg.id === (data.message as DMMessage).id ? { ...msg, isPinned: true } : msg));
        }
      },
      onMessageUnpinned: (data: MessageUnpinnedData) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => prev.map(msg => msg.id === data.messageId ? { ...msg, isPinned: false } : msg));
        }
      },
      onUserTyping: (data: TypingEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.some(u => u.userId === data.userId) ? prev : [...prev, { userId: data.userId, displayName: data.displayName, avatarUrl: data.avatarUrl }]);
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        const timeout = setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
          typingTimeouts.current.delete(data.userId);
        }, 3000);
        typingTimeouts.current.set(data.userId, timeout);
      },
      onUserStoppedTyping: (data: TypingEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
        const existingTimeout = typingTimeouts.current.get(data.userId);
        if (existingTimeout) clearTimeout(existingTimeout);
        typingTimeouts.current.delete(data.userId);
      },
    });

    return () => {
      isMounted = false;
      clearTimeout(markAsReadTimeout);
      leaveConversation(conversationId);
      unsubscribe();
      typingTimeouts.current.forEach(t => clearTimeout(t));
      typingTimeouts.current.clear();
      setTypingUsers([]);
      if (isTypingRef.current && user?.id) {
        sendDMTypingStop(conversationId, user.id);
        isTypingRef.current = false;
      }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    };
  }, [conversationId, markConversationRead]);

  // Fetch conversation details (participants, group info)
  useEffect(() => {
    (async () => {
      try {
        const response = await conversationApi.getConversation(conversationId);
        if (response.success) {
          const conv = response.data.conversation;
          setIsGroup(conv.isGroup);
          setParticipantCount(conv.participants?.length || 0);
          setDisplayName(conv.name);
          if (conv.participants) {
            setMentionUsers(
              conv.participants
                .filter((p: any) => p.userId !== user?.id)
                .map((p: any) => ({ id: p.userId, displayName: p.displayName, avatarUrl: p.avatarUrl })),
            );
          }
        }
      } catch {}
    })();
  }, [conversationId, user?.id]);

  // Subscribe to group events
  useEffect(() => {
    const unsubscribe = subscribeToGroupEvents({
      onGroupUpdated: (data: GroupUpdatedEventData) => {
        if (data.conversationId === conversationId) setDisplayName(data.displayName);
      },
      onGroupParticipantAdded: (data: GroupParticipantAddedEventData) => {
        if (data.conversationId !== conversationId) return;
        setParticipantCount(prev => prev + data.addedUsers.length);
        setMentionUsers(prev => {
          const existingIds = new Set(prev.map(u => u.id));
          const newUsers = data.addedUsers
            .filter(u => u.userId !== user?.id && !existingIds.has(u.userId))
            .map(u => ({ id: u.userId, displayName: u.displayName, avatarUrl: u.avatarUrl }));
          return [...prev, ...newUsers];
        });
      },
      onGroupParticipantLeft: (data: GroupParticipantLeftEventData) => {
        if (data.conversationId !== conversationId || data.userId === user?.id) return;
        setParticipantCount(prev => Math.max(0, prev - 1));
        setMentionUsers(prev => prev.filter(u => u.id !== data.userId));
      },
    });
    return () => unsubscribe();
  }, [conversationId, user?.id]);

  // --- Typing emission ---
  const handleTextChange = useCallback((text: string) => {
    setMessageText(text);
    if (!user?.id) return;
    if (text.length > 0) {
      if (!isTypingRef.current) { isTypingRef.current = true; sendDMTypingStart(conversationId, user.id); }
      if (typingEmitTimeout.current) clearTimeout(typingEmitTimeout.current);
      typingEmitTimeout.current = setTimeout(() => {
        if (isTypingRef.current) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
      }, 3000);
    } else {
      if (isTypingRef.current) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
      if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }
    }
  }, [conversationId, user?.id, setMessageText]);

  // --- Send message ---
  const handleSendMessage = async () => {
    const content = messageText.trim();
    const hasFiles = selectedFiles.length > 0;
    if (!content && !hasFiles) return;
    if (isSending || isUploading) return;

    // Stop typing
    if (isTypingRef.current && user?.id) { isTypingRef.current = false; sendDMTypingStop(conversationId, user.id); }
    if (typingEmitTimeout.current) { clearTimeout(typingEmitTimeout.current); typingEmitTimeout.current = null; }

    clearDraft();
    Keyboard.dismiss();

    try {
      if (hasFiles) {
        setIsUploading(true);
        setUploadProgress(0);
        const filesToUpload = selectedFiles.map(f => ({ uri: f.uri, name: f.name, type: f.type }));
        const response = await uploadApi.uploadToConversation(conversationId, filesToUpload, content || undefined, (p) => setUploadProgress(p));
        if (response.success) {
          const newMsg = response.data.message;
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
          clearFiles();
        }
      } else {
        setIsSending(true);
        const response = await conversationApi.sendMessage(conversationId, content);
        if (response.success) {
          const newMsg = response.data.message;
          setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        }
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
      if (!hasFiles) setMessageText(content);
    } finally {
      setIsSending(false);
      resetUpload();
    }
  };

  // --- Delete + Pin ---
  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    try {
      await conversationApi.deleteMessage(conversationId, selectedMessage.id);
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
        await conversationApi.unpinMessage(conversationId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: false } : m));
      } else {
        await conversationApi.pinMessage(conversationId, selectedMessage.id);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, isPinned: true } : m));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || `Failed to ${wasPinned ? 'unpin' : 'pin'} message`);
    }
    closeActions();
  };

  // --- Avatar tap -> profile ---
  const handleAvatarTap = useCallback(async (authorId: string, authorName: string) => {
    try {
      const res = await userApi.getSharedProgram(authorId);
      if (res.success && res.data.programId) {
        navigation.navigate('MemberProfile', { programId: res.data.programId, userId: authorId, memberName: authorName });
      } else {
        Alert.alert('Profile Unavailable', "You don't share any programs with this user.");
      }
    } catch {
      Alert.alert('Error', 'Could not load profile.');
    }
  }, [navigation]);

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore && messages.length > 0) fetchMessages(true);
  };

  // --- Render message ---
  const renderMessage = ({ item, index }: { item: DMMessage; index: number }) => {
    const isOwnMessage = item.authorId === user?.id;
    const showDate = shouldShowDateHeader(item.createdAt, index > 0 ? messages[index - 1].createdAt : null);
    const isEditing = editingMessage?.id === item.id;
    const isHighlighted = highlightedId === item.id;
    const showTimestamp = tappedMessageId === item.id;
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
          style={[styles.messageContainer, isOwnMessage && styles.ownMessageContainer, isEditing && styles.messageContainerEditing]}
          onPress={() => setTappedMessageId(prev => prev === item.id ? null : item.id)}
          onLongPress={() => openActions(item)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          {!isOwnMessage && (
            <TouchableOpacity onPress={() => handleAvatarTap(item.authorId, item.authorName)} activeOpacity={0.7}>
              <UserAvatar name={item.authorName} avatarUrl={item.authorAvatar} size={36} style={{ marginRight: spacing.sm }} />
            </TouchableOpacity>
          )}

          <View style={[styles.messageBubble, isOwnMessage && styles.ownMessageBubble]}>
            {!isOwnMessage && <Text style={styles.authorName}>{item.authorName}</Text>}
            {isEditing ? (
              <View style={styles.editContainer}>
                <TextInput ref={inputRef} style={styles.editInput} value={editText} onChangeText={setEditText} multiline autoFocus />
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEdit} style={styles.editButton}><Text style={styles.editButtonTextCancel}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity onPress={saveEdit} style={[styles.editButton, styles.editButtonSave]}><Text style={styles.editButtonTextSave}>Save</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {item.content ? (
                  <MarkdownText style={isOwnMessage ? styles.ownMessageContent : styles.messageContentText} mentionedUsers={mentionUsers.map(u => u.displayName)} mentionedRoles={[]} mentionEveryone={false}>
                    {item.content}
                  </MarkdownText>
                ) : null}
                {item.attachments && item.attachments.length > 0 && <AttachmentList attachments={item.attachments} />}

                {/* Inline meta badges (always visible when present) */}
                {hasMetaBadges && !showTimestamp && (
                  <View style={styles.metaBadgeRow}>
                    {item.isEdited && <Text style={[styles.metaBadge, isOwnMessage && styles.metaBadgeOwn]}>edited</Text>}
                    {item.isPinned && <Ionicons name="pin" size={10} color={isOwnMessage ? colors.textOnPrimary : colors.textMuted} style={{ marginLeft: 2 }} />}
                  </View>
                )}

                {/* Full timestamp row (tap to reveal) */}
                {showTimestamp && (
                  <View style={styles.timestampRow}>
                    <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
                      {formatMessageTime(item.createdAt, { includeDate: false })}
                      {item.isEdited && ' (edited)'}
                    </Text>
                    {item.isPinned && <Ionicons name="pin" size={12} color={isOwnMessage ? colors.textOnPrimary : colors.textMuted} style={{ marginLeft: 4 }} />}
                  </View>
                )}

                {item.reactions && item.reactions.length > 0 && (
                  <ReactionBar
                    reactions={item.reactions}
                    currentUserId={user?.id}
                    onReactionPress={(emoji, hasReacted) => handleToggleReaction(item.id, emoji, hasReacted, setMessages)}
                    onAddReaction={() => openActions(item)}
                    isOwnMessage={isOwnMessage}
                  />
                )}
                <ThreadIndicator
                  replyCount={item.replyCount ?? 0}
                  lastReplyAt={item.lastReplyAt}
                  latestReplyAuthors={item.latestReplyAuthors}
                  onPress={() => navigation.navigate('Thread', { messageId: item.id, conversationId, conversationName: displayName })}
                />
              </>
            )}
          </View>
        </TouchableOpacity>
      </>
    );

    const handleSwipeReply = () => {
      navigation.navigate('Thread', { messageId: item.id, conversationId, conversationName: displayName });
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

    return <SwipeableMessage onSwipeReply={handleSwipeReply}>{messageContent}</SwipeableMessage>;
  };

  // --- Loading / Error ---
  if (isLoading) return <ChatLoadingState />;
  if (error) return <ChatErrorState error={error} onRetry={() => fetchMessages()} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ConnectionBanner />
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.messageList}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
            if (contentOffset.y < 50 && hasMore && !isLoadingMore) {
              handleLoadMore();
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
          onScrollToIndexFailed={info => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          onContentSizeChange={() => {
            if ((route.params.highlightMessageId || highlightMessageId) && !hasScrolledToHighlight.current) return;
            if (messages.length > 0 && !isLoadingMore && isNearBottom.current) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          ListHeaderComponent={
            isLoadingMore ? <ActivityIndicator style={styles.loadingMore} color={colors.primary} /> :
            hasMore && messages.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}><Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textMuted} /><Text style={styles.emptyText}>Start the conversation!</Text></View>
          }
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

        {/* Typing Indicator */}
        <TypingIndicator typingUsers={typingUsers} />

        {/* Attachment Preview */}
        {selectedFiles.length > 0 && <AttachmentPreview files={selectedFiles} onRemove={removeFile} isUploading={isUploading} uploadProgress={uploadProgress} />}

        {/* Message Input */}
        {!editingMessage && (
          <View style={styles.inputWrapper}>
            <TouchableOpacity style={[styles.attachButton, isUploading && { opacity: 0.4 }]} onPress={openPicker} disabled={isUploading}>
              <Ionicons name="add-circle-outline" size={26} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={styles.inputFlex}>
              <MessageInput
                value={messageText}
                onChangeText={handleTextChange}
                onSend={handleSendMessage}
                placeholder={`Message ${displayName}`}
                isSending={isSending || isUploading}
                users={mentionUsers}
                roles={[]}
                includeSpecialMentions={false}
                sendButtonText="Send"
                maxLength={2000}
                canSendOverride={selectedFiles.length > 0 ? true : undefined}
              />
            </View>
          </View>
        )}

        <AttachmentPicker visible={showPicker} onClose={closePicker} onFilesSelected={addFiles} maxFiles={5} currentFileCount={selectedFiles.length} />
      </KeyboardAvoidingView>

      {/* Unified Message Actions */}
      <MessageActions
        visible={showActions}
        onClose={closeActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.authorId === user?.id}
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
          navigation.navigate('Thread', { messageId: threadMessageId, conversationId, conversationName: displayName });
        } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  messageList: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  loadingMore: { padding: spacing.md },
  loadMoreButton: { padding: spacing.md, alignItems: 'center' },
  loadMoreText: { color: colors.primary, fontSize: typography.fontSize.sm },

  // Date header
  dateHeader: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.md },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { marginHorizontal: spacing.md, fontSize: typography.fontSize.xs, color: colors.textMuted, fontWeight: typography.fontWeight.medium },

  // Message
  messageContainer: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-end' },
  ownMessageContainer: { justifyContent: 'flex-end' },
  messageContainerEditing: { backgroundColor: colors.primary + '10', padding: spacing.xs, borderRadius: borderRadius.md },
  messageBubble: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: '80%', borderBottomLeftRadius: borderRadius.sm },
  ownMessageBubble: { backgroundColor: colors.primary, borderBottomLeftRadius: borderRadius.lg, borderBottomRightRadius: borderRadius.sm },
  authorName: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.primary, marginBottom: 2 },
  messageContentText: { fontSize: typography.fontSize.md, color: colors.text, lineHeight: 20 },
  ownMessageContent: { fontSize: typography.fontSize.md, color: colors.white, lineHeight: 20 },
  metaBadgeRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  metaBadge: { fontSize: typography.fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
  metaBadgeOwn: { color: colors.textOnPrimary },
  timestampRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  timestamp: { fontSize: typography.fontSize.xs, color: colors.textMuted },
  ownTimestamp: { color: colors.textOnPrimary },

  // Edit
  editContainer: { flex: 1 },
  editInput: { backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.sm, fontSize: typography.fontSize.md, color: colors.text, minHeight: 40, maxHeight: 100 },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs, gap: spacing.sm },
  editButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm },
  editButtonSave: { backgroundColor: colors.primary },
  editButtonTextCancel: { color: colors.textMuted, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  editButtonTextSave: { color: colors.white, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },

  // Empty
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyText: { fontSize: typography.fontSize.md, color: colors.textMuted },

  // Input area
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  attachButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs, marginBottom: spacing.xs },
  inputFlex: { flex: 1 },
});

// Header styles (extracted from inline)
const headerStyles = StyleSheet.create({
  titleContainer: { alignItems: 'center', maxWidth: 200 },
  titleText: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text },
  subtitleText: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 1 },
  rightContainer: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { paddingHorizontal: 8, paddingVertical: 6 },
});
