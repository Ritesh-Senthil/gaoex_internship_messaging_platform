/**
 * Channel Screen
 * Displays messages in a channel with send functionality
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
import { useRoute, RouteProp } from '@react-navigation/native';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Message } from '../types';
import { channelApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  joinChannel,
  leaveChannel,
  subscribeToChannelEvents,
} from '../services/socket';
import MarkdownText from '../components/MarkdownText';
import MessageActions from '../components/MessageActions';
import ReactionBar, { Reaction } from '../components/ReactionBar';
import ReactionPicker from '../components/ReactionPicker';
import { reactionApi } from '../services/api';

type RouteProps = RouteProp<RootStackParamList, 'Channel'>;

export default function ChannelScreen() {
  const route = useRoute<RouteProps>();
  const { channelId, channelName } = route.params;
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Edit mode state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  
  // Action sheet state
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showActions, setShowActions] = useState(false);
  
  // Reaction picker state
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionTargetMessage, setReactionTargetMessage] = useState<Message | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

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
      console.error('Failed to fetch messages:', err);
      setError(err.message || 'Failed to load messages');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [channelId, hasMore, isLoadingMore, messages]);

  useEffect(() => {
    fetchMessages();
  }, [channelId]);

  // Real-time socket connection
  useEffect(() => {
    // Join channel room
    joinChannel(channelId);

    // Subscribe to real-time events
    const unsubscribe = subscribeToChannelEvents({
      onNewMessage: (message: Message) => {
        // Only add if it's for this channel and not from us (we already added it optimistically)
        if (message.channelId === channelId && message.author.id !== user?.id) {
          setMessages(prev => {
            // Check if message already exists (avoid duplicates)
            if (prev.some(m => m.id === message.id)) {
              return prev;
            }
            return [...prev, message];
          });
          // Scroll to bottom for new messages
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
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
      onReactionAdded: (data) => {
        // Skip if it's our own reaction (already handled optimistically)
        if (data.channelId === channelId && data.user.id !== user?.id) {
          setMessages(prev => prev.map(msg => {
            if (msg.id !== data.messageId) return msg;
            const reactions = msg.reactions || [];
            const existingReaction = reactions.find(r => r.emoji === data.emoji);
            if (existingReaction) {
              // Add user to existing reaction
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
            // Add new reaction
            return {
              ...msg,
              reactions: [...reactions, { emoji: data.emoji, count: 1, users: [data.user] }],
            };
          }));
        }
      },
      onReactionRemoved: (data) => {
        // Skip if it's our own reaction (already handled optimistically)
        if (data.channelId === channelId && data.user.id !== user?.id) {
          setMessages(prev => prev.map(msg => {
            if (msg.id !== data.messageId) return msg;
            const reactions = msg.reactions || [];
            return {
              ...msg,
              reactions: reactions
                .map(r => {
                  if (r.emoji !== data.emoji) return r;
                  return {
                    ...r,
                    count: r.count - 1,
                    users: (r.users || []).filter(u => u.id !== data.user.id),
                  };
                })
                .filter(r => r.count > 0),
            };
          }));
        }
      },
    });

    // Cleanup on unmount
    return () => {
      leaveChannel(channelId);
      unsubscribe();
    };
  }, [channelId, user?.id]);

  const handleSendMessage = async () => {
    const content = messageText.trim();
    if (!content || isSending) return;

    Keyboard.dismiss();
    setIsSending(true);

    try {
      const response = await channelApi.sendMessage(channelId, content);

      if (response.success) {
        setMessages(prev => [...prev, response.data.message]);
        setMessageText('');

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (err: any) {
      console.error('Failed to send message:', err);
      Alert.alert('Error', err.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleMessagePress = (message: Message) => {
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
      const response = await channelApi.editMessage(channelId, editingMessage.id, editText.trim());
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
      await channelApi.deleteMessage(channelId, selectedMessage.id);
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
      setSelectedMessage(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete message');
    }
  };

  const handleOpenReactionPicker = (message?: Message) => {
    const targetMessage = message || selectedMessage;
    if (targetMessage) {
      setReactionTargetMessage(targetMessage);
      setShowReactionPicker(true);
      setShowActions(false);
    }
  };

  const handleAddReaction = async (emoji: string) => {
    if (!reactionTargetMessage) return;
    
    try {
      await reactionApi.addReaction(reactionTargetMessage.id, emoji);
      
      // Update local state
      setMessages(prev => prev.map(m => {
        if (m.id === reactionTargetMessage.id) {
          const existingReaction = m.reactions?.find(r => r.emoji === emoji);
          if (existingReaction) {
            return {
              ...m,
              reactions: m.reactions?.map(r => 
                r.emoji === emoji 
                  ? { ...r, count: r.count + 1, users: [...r.users, { id: user!.id, displayName: user!.displayName }] }
                  : r
              ),
            };
          } else {
            return {
              ...m,
              reactions: [...(m.reactions || []), { emoji, count: 1, users: [{ id: user!.id, displayName: user!.displayName }] }],
            };
          }
        }
        return m;
      }));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add reaction');
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string, hasReacted: boolean) => {
    try {
      if (hasReacted) {
        await reactionApi.removeReaction(messageId, emoji);
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              reactions: m.reactions?.map(r => {
                if (r.emoji === emoji) {
                  const newUsers = r.users.filter(u => u.id !== user?.id);
                  return { ...r, count: r.count - 1, users: newUsers };
                }
                return r;
              }).filter(r => r.count > 0),
            };
          }
          return m;
        }));
      } else {
        await reactionApi.addReaction(messageId, emoji);
        setMessages(prev => prev.map(m => {
          if (m.id === messageId) {
            const existingReaction = m.reactions?.find(r => r.emoji === emoji);
            if (existingReaction) {
              return {
                ...m,
                reactions: m.reactions?.map(r =>
                  r.emoji === emoji
                    ? { ...r, count: r.count + 1, users: [...r.users, { id: user!.id, displayName: user!.displayName }] }
                    : r
                ),
              };
            }
          }
          return m;
        }));
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update reaction');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
      return `Today at ${timeStr}`;
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday at ${timeStr}`;
    }
    
    return `${date.toLocaleDateString()} ${timeStr}`;
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.author.id === user?.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showHeader = !prevMessage || 
      prevMessage.author.id !== item.author.id ||
      new Date(item.createdAt).getTime() - new Date(prevMessage.createdAt).getTime() > 5 * 60 * 1000;

    const isEditing = editingMessage?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.messageContainer, isEditing && styles.messageContainerEditing]}
        onLongPress={() => handleMessagePress(item)}
        delayLongPress={300}
        activeOpacity={0.8}
      >
        {showHeader && (
          <View style={styles.messageHeader}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.author.displayName) }]}>
              <Text style={styles.avatarText}>
                {item.author.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.messageHeaderText}>
              <Text style={styles.authorName}>{item.author.displayName}</Text>
              <Text style={styles.timestamp}>{formatTime(item.createdAt)}</Text>
            </View>
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
              <MarkdownText
                style={styles.messageText}
                mentionedUsers={item.mentionedUsers}
                mentionedRoles={item.mentionedRoles}
                mentionEveryone={item.mentionEveryone}
              >
                {item.content}
              </MarkdownText>
              {item.isEdited && <Text style={styles.editedLabel}>(edited)</Text>}
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
    );
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>👋</Text>
      <Text style={styles.emptyTitle}>Welcome to #{channelName}</Text>
      <Text style={styles.emptySubtitle}>This is the beginning of the channel. Send the first message!</Text>
    </View>
  );

  const renderLoadingMore = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.loadingMore}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
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
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={messages.length === 0 ? styles.emptyList : styles.messageList}
          ListEmptyComponent={renderEmptyState}
          ListHeaderComponent={renderLoadingMore}
          onEndReachedThreshold={0.5}
          onEndReached={() => {}}
          onScroll={({ nativeEvent }) => {
            if (nativeEvent.contentOffset.y < 50 && hasMore && !isLoadingMore) {
              fetchMessages(true);
            }
          }}
          scrollEventThrottle={400}
          inverted={false}
          onContentSizeChange={() => {
            if (messages.length > 0 && !isLoadingMore) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        {/* Message Input */}
        {!editingMessage && (
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder={`Message #${channelName}`}
              placeholderTextColor={colors.textMuted}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={4000}
              returnKeyType="default"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!messageText.trim() || isSending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={!messageText.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.sendButtonText}>→</Text>
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
        isOwnMessage={selectedMessage?.author.id === user?.id}
        onEdit={handleEditMessage}
        onDelete={handleDeleteMessage}
        onReact={() => handleOpenReactionPicker()}
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
  keyboardAvoid: {
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
  },
  emptyList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadingMore: {
    padding: spacing.md,
    alignItems: 'center',
  },
  messageContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  messageContainerEditing: {
    backgroundColor: colors.primary + '10',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  messageHeaderText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1,
  },
  authorName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginRight: spacing.sm,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  messageContent: {
    marginLeft: 48,
    marginTop: spacing.xs,
  },
  messageContentContinued: {
    marginTop: 2,
  },
  messageText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  editedLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  editContainer: {
    flex: 1,
  },
  editInput: {
    backgroundColor: colors.surface,
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
  sendButtonText: {
    fontSize: 20,
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
  },
});
