/**
 * Conversations List Screen
 * Shows all DM conversations (1:1 and group) for the current user
 * Uses real-time socket events for unread updates and group changes
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import { RootStackParamList, Conversation } from '../types';
import UserAvatar from '../components/UserAvatar';
import { conversationApi } from '../services/api';
import { useUnreadStore } from '../store/unreadStore';
import { useAuthStore } from '../store/authStore';
import { useMuteStore } from '../store/muteStore';
import { getActiveConversationId } from '../store/activeChatStore';
import { 
  subscribeToUnreadEvents,
  subscribeToPresenceEvents,
  subscribeToGroupEvents,
  UnreadDMEventData,
  UserOnlineEventData,
  UserOfflineEventData,
  UserProfileUpdatedEventData,
  GroupCreatedEventData,
  GroupUpdatedEventData,
  GroupParticipantAddedEventData,
  GroupParticipantLeftEventData,
} from '../services/socket';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationsListScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get unread state and actions from store
  const { conversationUnreads, setAllConversationUnreads, incrementConversationUnread, markConversationRead } = useUnreadStore();
  const { user } = useAuthStore();
  const { conversationMutes, initConversationMutes } = useMuteStore();

  const fetchConversations = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await conversationApi.getConversations();

      if (response.success) {
        setConversations(response.data.conversations);
        
        // Populate unread store with conversation unread data from API
        const unreads: Record<string, number> = {};
        response.data.conversations.forEach(conv => {
          unreads[conv.id] = conv.unreadCount || 0;
        });
        setAllConversationUnreads(unreads);

        // Seed mute store
        const mutes: Record<string, boolean> = {};
        response.data.conversations.forEach(conv => {
          if (conv.isMuted) mutes[conv.id] = true;
        });
        initConversationMutes(mutes);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [setAllConversationUnreads]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Subscribe to DM unread events
  useEffect(() => {
    const unsubscribe = subscribeToUnreadEvents({
      onUnreadDM: (data: UnreadDMEventData) => {
        // Ignore if this is for a different user
        if (data.recipientUserId !== user?.id) return;
        // Ignore if we're currently in this conversation
        if (getActiveConversationId() === data.conversationId) return;
        
        // Update unread count
        incrementConversationUnread(data.conversationId);
      },
    });
    
    return () => {
      unsubscribe();
    };
  }, [user?.id, incrementConversationUnread]);

  // Subscribe to presence events for DM partner online status
  useEffect(() => {
    const unsubscribe = subscribeToPresenceEvents({
      onUserOnline: (data: UserOnlineEventData) => {
        setConversations(prev => prev.map(conv => {
          const hasParticipant = conv.participants?.some(p => p.userId === data.userId);
          if (!hasParticipant) return conv;
          
          // For 1:1 DMs, update the top-level isOnline. For groups, only update participant.
          return {
            ...conv,
            isOnline: !conv.isGroup ? true : conv.isOnline,
            participants: conv.participants?.map(p => 
              p.userId === data.userId ? { ...p, isOnline: true } : p
            ),
          };
        }));
      },
      onUserOffline: (data: UserOfflineEventData) => {
        setConversations(prev => prev.map(conv => {
          const hasParticipant = conv.participants?.some(p => p.userId === data.userId);
          if (!hasParticipant) return conv;
          
          return {
            ...conv,
            isOnline: !conv.isGroup ? false : conv.isOnline,
            participants: conv.participants?.map(p => 
              p.userId === data.userId ? { ...p, isOnline: false } : p
            ),
          };
        }));
      },
      onUserProfileUpdated: (data: UserProfileUpdatedEventData) => {
        setConversations(prev => prev.map(conv => {
          const hasParticipant = conv.participants?.some(p => p.userId === data.userId);
          if (!hasParticipant) return conv;
          
          return {
            ...conv,
            // Only update the top-level name/avatar for 1:1 conversations
            ...(!conv.isGroup && {
              name: data.displayName || conv.name,
              avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : conv.avatarUrl,
            }),
            participants: conv.participants?.map(p => 
              p.userId === data.userId 
                ? { 
                    ...p, 
                    displayName: data.displayName || p.displayName,
                    avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : p.avatarUrl,
                  } 
                : p
            ),
          };
        }));
      },
    });
    
    return () => unsubscribe();
  }, []);

  // Subscribe to group DM events
  useEffect(() => {
    const unsubscribe = subscribeToGroupEvents({
      onGroupCreated: (data: GroupCreatedEventData) => {
        // A new group was created that includes us — add it to the list
        const conv = data.conversation;
        setConversations(prev => {
          // Avoid duplicates
          if (prev.some(c => c.id === conv.id)) return prev;
          const newConv: Conversation = {
            id: conv.id,
            isGroup: true,
            groupName: conv.groupName || null,
            name: conv.name,
            avatarUrl: null,
            isOnline: false,
            participants: conv.participants,
            lastMessage: null,
            unreadCount: 0,
            isMuted: false,
            createdById: conv.createdById || null,
            updatedAt: new Date().toISOString(),
          };
          return [newConv, ...prev];
        });
      },
      onGroupUpdated: (data: GroupUpdatedEventData) => {
        // Group was renamed
        setConversations(prev => prev.map(conv => {
          if (conv.id !== data.conversationId) return conv;
          return {
            ...conv,
            groupName: data.name,
            name: data.displayName,
          };
        }));
      },
      onGroupParticipantAdded: (data: GroupParticipantAddedEventData) => {
        // New members added to a group we're in
        setConversations(prev => prev.map(conv => {
          if (conv.id !== data.conversationId) return conv;
          const existingIds = new Set(conv.participants.map(p => p.userId));
          const newParticipants = data.addedUsers.filter(u => !existingIds.has(u.userId));
          if (newParticipants.length === 0) return conv;
          
          const updatedParticipants = [...conv.participants, ...newParticipants];
          // If no custom group name, rebuild the display name from participants
          const displayName = conv.groupName
            ? conv.name
            : updatedParticipants
                .filter(p => p.userId !== user?.id)
                .map(p => p.displayName)
                .join(', ') || 'Group';

          return {
            ...conv,
            participants: updatedParticipants,
            name: displayName,
          };
        }));
      },
      onGroupParticipantLeft: (data: GroupParticipantLeftEventData) => {
        // Someone left a group we're in
        setConversations(prev => prev.map(conv => {
          if (conv.id !== data.conversationId) return conv;
          const updatedParticipants = conv.participants.filter(p => p.userId !== data.userId);
          // If no custom group name, rebuild the display name from remaining participants
          const displayName = conv.groupName
            ? conv.name
            : updatedParticipants
                .filter(p => p.userId !== user?.id)
                .map(p => p.displayName)
                .join(', ') || 'Group';

          return {
            ...conv,
            participants: updatedParticipants,
            name: displayName,
          };
        }));
      },
    });

    return () => unsubscribe();
  }, [user?.id]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Mute state updates come from the muteStore — no refetch needed
    }, [])
  );

  const handleConversationPress = (conv: Conversation) => {
    // Optimistically mark conversation as read BEFORE navigating
    markConversationRead(conv.id);

    navigation.navigate('Conversation', {
      conversationId: conv.id,
      name: conv.name,
    });
  };

  const handleNewConversation = () => {
    navigation.navigate('NewConversation');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  /** Format the last message preview — prefixed with author name for groups */
  const formatLastMessage = (conv: Conversation): string => {
    if (!conv.lastMessage) return '';
    if (!conv.isGroup) return conv.lastMessage.content;

    // In groups, prefix with the author's first name
    const authorFirst = conv.lastMessage.authorName?.split(' ')[0] || '';
    const isOwnMessage = conv.lastMessage.authorId === user?.id;
    const prefix = isOwnMessage ? 'You' : authorFirst;
    return `${prefix}: ${conv.lastMessage.content}`;
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    // Get unread count from store (real-time updates) with fallback to API data
    const unreadCount = conversationUnreads[item.id] ?? item.unreadCount ?? 0;
    // Get mute state from store (instant updates from child screen)
    const isConvMuted = conversationMutes[item.id] ?? item.isMuted ?? false;
    
    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => handleConversationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {item.isGroup ? (
            <View style={{ position: 'relative' }}>
              <UserAvatar
                name={item.name}
                avatarUrl={null}
                size={50}
              />
              <View style={styles.groupBadge}>
                <Ionicons name="people" size={10} color={colors.white} />
              </View>
            </View>
          ) : (
            <UserAvatar
              name={item.name}
              avatarUrl={item.avatarUrl}
              size={50}
              showStatus={item.isOnline}
              statusColor={colors.online}
            />
          )}
        </View>

        <View style={styles.conversationInfo}>
          <View style={styles.nameRow}>
            <Text style={[
              styles.conversationName,
              unreadCount > 0 && styles.conversationNameUnread
            ]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.lastMessage && (
              <Text style={[styles.timestamp, unreadCount > 0 && styles.timestampUnread]}>
                {formatTime(item.lastMessage.createdAt)}
              </Text>
            )}
          </View>

          <Text style={[styles.lastMessage, unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
            {formatLastMessage(item) || (item.isGroup ? 'No messages yet' : '')}
          </Text>
        </View>

        {/* Muted indicator */}
        {isConvMuted && (
          <Ionicons name="notifications-off-outline" size={16} color={colors.textMuted} style={styles.mutedIcon} />
        )}

        {/* Unread badge */}
        {unreadCount > 0 && !isConvMuted && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
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
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchConversations()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={handleNewConversation}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchConversations(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyText}>
              Start a conversation with someone to begin messaging
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={handleNewConversation}>
              <Text style={styles.startButtonText}>Start a Conversation</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* New Conversation FAB */}
      {conversations.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleNewConversation}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
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
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
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

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Conversation Row ──
  listContent: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  groupBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  conversationInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  conversationName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  conversationNameUnread: {
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  timestamp: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  timestampUnread: {
    color: colors.primary,
  },
  lastMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
  },
  lastMessageUnread: {
    color: colors.textSecondary,
  },
  mutedIcon: {
    marginLeft: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: spacing.sm,
  },
  unreadText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },

  // ── Empty State ──
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  startButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
});
