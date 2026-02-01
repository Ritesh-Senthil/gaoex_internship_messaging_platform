/**
 * Conversation Screen
 * Displays messages in a DM conversation with send functionality
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, DMMessage } from '../types';
import { conversationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  joinConversation,
  leaveConversation,
  broadcastDMMessage,
  subscribeToConversationEvents,
} from '../services/socket';
import MarkdownText from '../components/MarkdownText';
import MessageActions from '../components/MessageActions';
import ReactionBar from '../components/ReactionBar';
import ReactionPicker from '../components/ReactionPicker';
import { reactionApi } from '../services/api';

type RouteProps = RouteProp<RootStackParamList, 'Conversation'>;

export default function ConversationScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { conversationId, name } = route.params;
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Edit mode state
  const [editingMessage, setEditingMessage] = useState<DMMessage | null>(null);
  const [editText, setEditText] = useState('');
  
  // Action sheet state
  const [selectedMessage, setSelectedMessage] = useState<DMMessage | null>(null);
  const [showActions, setShowActions] = useState(false);
  
  // Reaction picker state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionTargetMessage, setReactionTargetMessage] = useState<DMMessage | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const fetchMessages = useCallback(async (loadMore = false) => {
    try {
      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const beforeDate = loadMore && messages.length > 0
        ? messages[0].createdAt
        : undefined;

      const response = await conversationApi.getMessages(
        conversationId,
        50,
        beforeDate
      );

      if (response.success) {
        if (loadMore) {
          setMessages(prev => [...response.data.messages, ...prev]);
        } else {
          setMessages(response.data.messages);
        }
        setHasMore(response.data.hasMore);
      }
    } catch (err: any) {
      console.error('Failed to fetch messages:', err);
      if (!loadMore) {
        setError(err.message || 'Failed to load messages');
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [conversationId, messages]);

  useEffect(() => {
    navigation.setOptions({ title: name });
    fetchMessages();
    joinConversation(conversationId);

    // Subscribe to real-time messages
    const unsubscribe = subscribeToConversationEvents({
      onNewDMMessage: (data) => {
        if (data.conversationId === conversationId) {
          setMessages(prev => [...prev, data.message]);
          // Scroll to bottom on new message
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
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
      onReactionAdded: (data) => {
        // Skip if it's our own reaction (already handled optimistically)
        if (data.conversationId === conversationId && data.user.id !== user?.id) {
          setMessages(prev => prev.map(msg => {
            if (msg.id !== data.messageId) return msg;
            const reactions = msg.reactions || [];
            const existingReaction = reactions.find(r => r.emoji === data.emoji);
            if (existingReaction) {
              if (!existingReaction.users?.some(u => u.id === data.user.id)) {
                return {
                  ...msg,
                  reactions: reactions.map(r =>
                    r.emoji === data.emoji
                      ? { ...r, count: r.count + 1, users: [...(r.users || []), data.user] }
                      : r
                  ),
                };
              }
              return msg;
            }
            return {
              ...msg,
              reactions: [...reactions, { emoji: data.emoji, count: 1, users: [data.user] }],
            };
          }));
        }
      },
      onReactionRemoved: (data) => {
        // Skip if it's our own reaction (already handled optimistically)
        if (data.conversationId === conversationId && data.user.id !== user?.id) {
          setMessages(prev => prev.map(msg => {
            if (msg.id !== data.messageId) return msg;
            return {
              ...msg,
              reactions: (msg.reactions || [])
                .map(r => r.emoji === data.emoji
                  ? { ...r, count: r.count - 1, users: (r.users || []).filter(u => u.id !== data.user.id) }
                  : r
                )
                .filter(r => r.count > 0),
            };
          }));
        }
      },
    });

    return () => {
      leaveConversation(conversationId);
      unsubscribe();
    };
  }, [conversationId, name, navigation]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || isSending) return;

    const content = messageText.trim();
    setMessageText('');
    Keyboard.dismiss();
    setIsSending(true);

    try {
      const response = await conversationApi.sendMessage(conversationId, content);

      if (response.success) {
        const newMessage = response.data.message;
        setMessages(prev => [...prev, newMessage]);

        // Broadcast to other participants
        broadcastDMMessage(conversationId, newMessage);

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setMessageText(content); // Restore the message
    } finally {
      setIsSending(false);
    }
  };

  const handleMessagePress = (message: DMMessage) => {
    setSelectedMessage(message);
    setShowActions(true);
  };

  const handleCloseActions = () => {
    setShowActions(false);
    setSelectedMessage(null);
  };

  const handleEditMessage = () => {
    if (selectedMessage) {
      setEditingMessage(selectedMessage);
      setEditText(selectedMessage.content);
      setShowActions(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editText.trim()) return;

    try {
      const response = await conversationApi.editMessage(conversationId, editingMessage.id, editText.trim());
      if (response.success) {
        setMessages(prev => prev.map(m => m.id === editingMessage.id ? response.data.message : m));
        setEditingMessage(null);
        setEditText('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to edit message');
    }
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return;
    
    try {
      await conversationApi.deleteMessage(conversationId, selectedMessage.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      setSelectedMessage(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete message');
    }
  };

  const handleOpenReactionPicker = (message: DMMessage) => {
    setShowActions(false);
    setReactionTargetMessage(message);
    setShowReactionPicker(true);
  };

  const handleAddReaction = async (emoji: string) => {
    if (!reactionTargetMessage) return;
    setShowReactionPicker(false);
    try {
      await reactionApi.addReaction(reactionTargetMessage.id, emoji);
      // Update local state optimistically
      setMessages(prev => prev.map(msg => {
        if (msg.id !== reactionTargetMessage.id) return msg;
        const reactions = msg.reactions || [];
        const existingReaction = reactions.find(r => r.emoji === emoji);
        if (existingReaction) {
          return {
            ...msg,
            reactions: reactions.map(r =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, users: [...(r.users || []), { id: user!.id, displayName: user!.displayName }] }
                : r
            ),
          };
        }
        return {
          ...msg,
          reactions: [...reactions, { emoji, count: 1, users: [{ id: user!.id, displayName: user!.displayName }] }],
        };
      }));
    } catch (err: any) {
      console.error('Failed to add reaction:', err);
    }
    setReactionTargetMessage(null);
  };

  const handleToggleReaction = async (messageId: string, emoji: string, hasReacted: boolean) => {
    try {
      if (hasReacted) {
        await reactionApi.removeReaction(messageId, emoji);
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId) return msg;
          return {
            ...msg,
            reactions: (msg.reactions || [])
              .map(r => r.emoji === emoji ? { ...r, count: r.count - 1, users: (r.users || []).filter(u => u.id !== user?.id) } : r)
              .filter(r => r.count > 0),
          };
        }));
      } else {
        await reactionApi.addReaction(messageId, emoji);
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId) return msg;
          const reactions = msg.reactions || [];
          const existingReaction = reactions.find(r => r.emoji === emoji);
          if (existingReaction) {
            return {
              ...msg,
              reactions: reactions.map(r =>
                r.emoji === emoji
                  ? { ...r, count: r.count + 1, users: [...(r.users || []), { id: user!.id, displayName: user!.displayName }] }
                  : r
              ),
            };
          }
          return {
            ...msg,
            reactions: [...reactions, { emoji, count: 1, users: [{ id: user!.id, displayName: user!.displayName }] }],
          };
        }));
      }
    } catch (err: any) {
      console.error('Failed to toggle reaction:', err);
    }
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore && messages.length > 0) {
      fetchMessages(true);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const shouldShowDateHeader = (index: number) => {
    if (index === 0) return true;
    const currentDate = new Date(messages[index].createdAt).toDateString();
    const prevDate = new Date(messages[index - 1].createdAt).toDateString();
    return currentDate !== prevDate;
  };

  const getAvatarColor = (name: string) => {
    const colorList = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colorList.length;
    return colorList[index];
  };

  const renderMessage = ({ item, index }: { item: DMMessage; index: number }) => {
    const isOwnMessage = item.authorId === user?.id;
    const showDateHeader = shouldShowDateHeader(index);
    const isEditing = editingMessage?.id === item.id;

    return (
      <>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{formatDateHeader(item.createdAt)}</Text>
            <View style={styles.dateLine} />
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.messageContainer, 
            isOwnMessage && styles.ownMessageContainer,
            isEditing && styles.messageContainerEditing,
          ]}
          onLongPress={() => handleMessagePress(item)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          {!isOwnMessage && (
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.authorName) }]}>
              <Text style={styles.avatarText}>
                {item.authorName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={[styles.messageBubble, isOwnMessage && styles.ownMessageBubble]}>
            {!isOwnMessage && (
              <Text style={styles.authorName}>{item.authorName}</Text>
            )}
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
                  <TouchableOpacity onPress={handleCancelEdit} style={styles.editButton}>
                    <Text style={styles.editButtonTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveEdit} style={[styles.editButton, styles.editButtonSave]}>
                    <Text style={styles.editButtonTextSave}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <MarkdownText style={isOwnMessage ? styles.ownMessageContent : styles.messageContent}>
                  {item.content}
                </MarkdownText>
                <Text style={[styles.timestamp, isOwnMessage && styles.ownTimestamp]}>
                  {formatTime(item.createdAt)}
                  {item.isEdited && ' (edited)'}
                </Text>
                {(item.reactions && item.reactions.length > 0) && (
                  <ReactionBar
                    reactions={item.reactions}
                    currentUserId={user?.id}
                    onReactionPress={(emoji, hasReacted) => handleToggleReaction(item.id, emoji, hasReacted)}
                    onAddReaction={() => handleOpenReactionPicker(item)}
                  />
                )}
              </>
            )}
          </View>
        </TouchableOpacity>
      </>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchMessages()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          inverted={false}
          ListHeaderComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.loadingMore} color={colors.primary} />
            ) : hasMore && messages.length > 0 ? (
              <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyText}>Start the conversation!</Text>
            </View>
          }
        />

        {!editingMessage && (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!messageText.trim() || isSending) && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Message Actions Sheet */}
      <MessageActions
        visible={showActions}
        onClose={handleCloseActions}
        messageContent={selectedMessage?.content || ''}
        isOwnMessage={selectedMessage?.authorId === user?.id}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReact={() => selectedMessage && handleOpenReactionPicker(selectedMessage)}
      />

      {/* Reaction Picker */}
      <ReactionPicker
        visible={showReactionPicker}
        onClose={() => {
          setShowReactionPicker(false);
          setReactionTargetMessage(null);
        }}
        onSelectEmoji={handleAddReaction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  messageList: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  loadingMore: {
    padding: spacing.md,
  },
  loadMoreButton: {
    padding: spacing.md,
    alignItems: 'center',
  },
  loadMoreText: {
    color: colors.primary,
    fontSize: typography.fontSize.sm,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dateText: {
    marginHorizontal: spacing.md,
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    fontWeight: typography.fontWeight.medium,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    alignItems: 'flex-end',
  },
  ownMessageContainer: {
    justifyContent: 'flex-end',
  },
  messageContainerEditing: {
    backgroundColor: colors.primary + '10',
    padding: spacing.xs,
    borderRadius: borderRadius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  messageBubble: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: '75%',
    borderBottomLeftRadius: borderRadius.sm,
  },
  ownMessageBubble: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
  },
  authorName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: 2,
  },
  messageContent: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    lineHeight: 20,
  },
  ownMessageContent: {
    color: colors.white,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  ownTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  sendButtonDisabled: {
    backgroundColor: colors.textMuted,
  },
  sendButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  editContainer: {
    flex: 1,
  },
  editInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
    minHeight: 40,
    maxHeight: 100,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  editButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  editButtonSave: {
    backgroundColor: colors.primary,
  },
  editButtonTextCancel: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  editButtonTextSave: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
