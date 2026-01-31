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

  const flatListRef = useRef<FlatList>(null);

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

  const handleDeleteMessage = async (messageId: string) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await channelApi.deleteMessage(channelId, messageId);
              setMessages(prev => prev.filter(m => m.id !== messageId));
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete message');
            }
          },
        },
      ]
    );
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

    return (
      <TouchableOpacity
        style={styles.messageContainer}
        onLongPress={() => isOwn && handleDeleteMessage(item.id)}
        delayLongPress={500}
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
          <Text style={styles.messageText}>{item.content}</Text>
          {item.isEdited && <Text style={styles.editedLabel}>(edited)</Text>}
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
      </KeyboardAvoidingView>
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
