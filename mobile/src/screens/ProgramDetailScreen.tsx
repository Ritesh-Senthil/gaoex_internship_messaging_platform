/**
 * Program Detail Screen
 * Shows categories and channels for a program
 * Uses real-time socket events for unread updates
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { APP_CONFIG } from '../constants/config';
import { RootStackParamList, ProgramDetail, Channel, Category } from '../types';
import { useUnreadStore } from '../store/unreadStore';
import { useAuthStore } from '../store/authStore';
import { useMuteStore } from '../store/muteStore';
import { useChannelStore, useProgramChannels, useProgramCategories } from '../store/channelStore';
import { getActiveChannelId } from '../store/activeChatStore';
import { 
  joinProgram, 
  leaveProgram, 
  subscribeToUnreadEvents, 
  subscribeToChannelCategoryEvents,
  subscribeToMemberRoleEvents,
  subscribeToProgramEvents,
  UnreadChannelEventData,
  UnreadMentionEventData,
  ChannelEventData,
  ChannelDeletedEventData,
  CategoryEventData,
  CategoryDeletedEventData,
  MemberEventData,
  ProgramUpdatedEventData,
  ProgramDeletedEventData,
} from '../services/socket';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ProgramDetail'>;

export default function ProgramDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId } = route.params;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [descExpanded, setDescExpanded] = useState(false);
  const isFirstFocus = useRef(true);
  
  // Get unread state and actions from store
  const { channelUnreads, setAllChannelUnreads, incrementChannelUnread, markChannelRead } = useUnreadStore();
  const { channelMutes, initChannelMutes } = useMuteStore();
  const { user } = useAuthStore();

  // Channels/categories come from the shared channelStore (keyed by program)
  const channels = useProgramChannels(programId);
  const categories = useProgramCategories(programId);

  const fetchProgram = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Fetch via the shared channelStore so channels/categories are kept in sync
      const programData = await useChannelStore.getState().fetchProgramChannels(programId);

      setProgram(programData);
      // Expand all categories by default
      const categoryIds = new Set(programData.categories.map(c => c.id));
      setExpandedCategories(categoryIds);

      // Populate unread store with channel unread data from API
      const unreads: Record<string, { hasUnread: boolean; mentionCount: number }> = {};
      // Collect from categorized channels
      programData.categories.forEach(cat => {
        cat.channels.forEach(ch => {
          unreads[ch.id] = {
            hasUnread: ch.hasUnread ?? false,
            mentionCount: ch.mentionCount ?? 0,
          };
        });
      });
      // Collect from uncategorized channels
      programData.channels.forEach(ch => {
        unreads[ch.id] = {
          hasUnread: ch.hasUnread ?? false,
          mentionCount: ch.mentionCount ?? 0,
        };
      });
      setAllChannelUnreads(unreads);

      // Seed mute store with channel mute data from API
      const mutes: Record<string, boolean> = {};
      programData.categories.forEach(cat => {
        cat.channels.forEach(ch => {
          if (ch.isMuted) mutes[ch.id] = true;
        });
      });
      programData.channels.forEach(ch => {
        if (ch.isMuted) mutes[ch.id] = true;
      });
      initChannelMutes(mutes);
    } catch (err: any) {
      setError(err.message || 'Failed to load program');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  // Join program room and subscribe to unread events
  useEffect(() => {
    // Join the program room to receive unread notifications
    joinProgram(programId);
    
    // Subscribe to unread events
    const unsubscribe = subscribeToUnreadEvents({
      onUnreadChannel: (data: UnreadChannelEventData) => {
        // Ignore if this event is for a different program
        if (data.programId !== programId) return;
        // Ignore if we're currently viewing this channel (any entry path)
        if (getActiveChannelId() === data.channelId) return;
        // Ignore if this is our own message
        if (data.authorId === user?.id) return;
        
        // Update unread state
        incrementChannelUnread(data.channelId, false);
      },
      onUnreadMention: (data: UnreadMentionEventData) => {
        // Ignore if this event is for a different program
        if (data.programId !== programId) return;
        // Ignore if we're not mentioned
        if (!user?.id || !data.mentionedUserIds.includes(user.id)) return;
        // Ignore if we're currently in this channel
        if (getActiveChannelId() === data.channelId) return;
        
        // Update unread state with mention
        incrementChannelUnread(data.channelId, true);
      },
    });
    
    return () => {
      leaveProgram(programId);
      unsubscribe();
    };
  }, [programId, user?.id, incrementChannelUnread]);

  // Subscribe to channel/category CRUD events
  useEffect(() => {
    const unsubscribe = subscribeToChannelCategoryEvents({
      onChannelCreated: (data: ChannelEventData) => {
        if (data.programId !== programId) return;
        useChannelStore.getState().addChannel(programId, data.channel);
      },
      onChannelUpdated: (data: ChannelEventData) => {
        if (data.programId !== programId) return;
        useChannelStore.getState().updateChannel(programId, data.channel.id, data.channel);
      },
      onChannelDeleted: (data: ChannelDeletedEventData) => {
        if (data.programId !== programId) return;
        useChannelStore.getState().removeChannel(programId, data.channelId);
      },
      onCategoryCreated: (data: CategoryEventData) => {
        if (data.programId !== programId) return;
        useChannelStore.getState().addCategory(programId, data.category);
        setExpandedCategories(s => new Set([...s, data.category.id]));
      },
      onCategoryUpdated: (data: CategoryEventData) => {
        if (data.programId !== programId) return;
        useChannelStore.getState().updateCategory(programId, data.category.id, data.category);
      },
      onCategoryDeleted: (data: CategoryDeletedEventData) => {
        if (data.programId !== programId) return;
        // Store moves the deleted category's channels back to uncategorized
        useChannelStore.getState().removeCategory(programId, data.categoryId);
      },
    });
    
    return () => {
      unsubscribe();
    };
  }, [programId]);

  // Subscribe to member join/leave events for member count updates
  useEffect(() => {
    const unsubscribe = subscribeToMemberRoleEvents({
      onMemberJoined: (data: MemberEventData) => {
        if (data.programId !== programId) return;
        setProgram(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            _count: {
              ...prev._count,
              memberships: prev._count.memberships + 1,
            },
          };
        });
      },
    });
    
    return () => {
      unsubscribe();
    };
  }, [programId]);

  // Subscribe to program-level events (settings changed, program deleted)
  useEffect(() => {
    const unsubscribe = subscribeToProgramEvents({
      onProgramUpdated: (data: ProgramUpdatedEventData) => {
        if (data.programId !== programId) return;
        setProgram(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            name: data.name || prev.name,
            description: data.description !== undefined ? data.description : prev.description,
            iconUrl: data.iconUrl !== undefined ? data.iconUrl : prev.iconUrl,
          };
        });
      },
      onProgramDeleted: (data: ProgramDeletedEventData) => {
        if (data.programId !== programId) return;
        Alert.alert(
          'Program Deleted',
          'This program has been deleted.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      },
    });
    
    return () => {
      unsubscribe();
    };
  }, [programId, navigation]);

  // Refresh when screen comes into focus (e.g., returning from a channel)
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      // Mute state updates come from the muteStore — no refetch needed
    }, [programId])
  );

  useEffect(() => {
    if (program) {
      navigation.setOptions({ title: program.name });
    }
  }, [program, navigation]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleChannelPress = (channel: Channel) => {
    // Optimistically mark channel as read BEFORE navigating
    markChannelRead(channel.id);

    navigation.navigate('Channel', {
      channelId: channel.id,
      channelName: channel.name,
      programId: programId,
    });
  };

  const handleInvitePress = async () => {
    if (program) {
      try {
        await Share.share({
          message: `Join "${program.name}" on ${APP_CONFIG.APP_NAME} with invite code: ${program.inviteCode}`,
        });
      } catch {
        Alert.alert(
          'Invite Code',
          `Share this code to invite others:\n\n${program.inviteCode}`,
          [{ text: 'OK' }],
        );
      }
    }
  };

  const handleMembersPress = () => {
    if (program) {
      navigation.navigate('MemberDirectory', {
        programId: program.id,
        programName: program.name,
      });
    }
  };

  const handleRolesPress = () => {
    if (program) {
      navigation.navigate('RolesList', {
        programId: program.id,
        programName: program.name,
      });
    }
  };

  const handleSettingsPress = () => {
    if (program) {
      navigation.navigate('ProgramSettings', {
        programId: program.id,
        programName: program.name,
      });
    }
  };

  const getChannelIcon = (channel: Channel): { name: keyof typeof Ionicons.glyphMap; color: string } | null => {
    if (channel.isPrivate) return { name: 'lock-closed', color: colors.channelText };
    if (channel.type === 'ANNOUNCEMENT') return { name: 'megaphone-outline', color: colors.channelText };
    return null; // text channels use styled '#'
  };

  const renderChannel = (channel: Channel) => {
    // Get unread state from store (real-time updates) with fallback to API data
    const unreadState = channelUnreads[channel.id] || { 
      hasUnread: channel.hasUnread ?? false, 
      mentionCount: channel.mentionCount ?? 0 
    };
    const { hasUnread, mentionCount } = unreadState;
    // Get mute state from store (instant updates from child screen)
    const isChannelMuted = channelMutes[channel.id] ?? channel.isMuted ?? false;
    const iconInfo = getChannelIcon(channel);
    
    return (
      <TouchableOpacity
        key={channel.id}
        style={styles.channelItem}
        onPress={() => handleChannelPress(channel)}
        activeOpacity={0.7}
      >
        <View style={styles.channelIconWrap}>
          {iconInfo ? (
            <Ionicons name={iconInfo.name} size={16} color={hasUnread ? colors.text : iconInfo.color} />
          ) : (
            <Text style={[styles.channelHash, hasUnread && styles.channelHashUnread]}>#</Text>
          )}
        </View>
        <View style={styles.channelInfo}>
          <Text style={[styles.channelName, hasUnread && styles.channelNameUnread]} numberOfLines={1}>
            {channel.name}
          </Text>
          {channel.topic && (
            <Text style={styles.channelTopic} numberOfLines={1}>
              {channel.topic}
            </Text>
          )}
        </View>
        {/* Muted indicator */}
        {isChannelMuted && (
          <Ionicons name="notifications-off-outline" size={14} color={colors.textMuted} style={{ marginLeft: spacing.sm, opacity: 0.6 }} />
        )}
        {/* Unread indicators - from store for real-time updates (hidden when muted) */}
        {!isChannelMuted && mentionCount > 0 ? (
          <View style={styles.mentionBadge}>
            <Text style={styles.mentionBadgeText}>{mentionCount}</Text>
          </View>
        ) : !isChannelMuted && hasUnread ? (
          <View style={styles.unreadDot} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderCategory = (category: Category) => {
    const isExpanded = expandedCategories.has(category.id);

    return (
      <View key={category.id} style={styles.categoryContainer}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.id)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={colors.textMuted}
            style={{ marginRight: spacing.sm }}
          />
          <Text style={styles.categoryName}>{category.name}</Text>
          <View style={styles.categoryCountBadge}>
            <Text style={styles.categoryCount}>{category.channels.length}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.channelList}>
            {category.channels.map(renderChannel)}
          </View>
        )}
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

  if (error || !program) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={styles.errorText}>{error || 'Program not found'}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchProgram()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.goBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const actionButtons = [
    { icon: 'people-outline' as const, label: 'Members', sublabel: `${program._count.memberships}`, onPress: handleMembersPress },
    { icon: 'pricetag-outline' as const, label: 'Roles', onPress: handleRolesPress },
    { icon: 'settings-outline' as const, label: 'Settings', onPress: handleSettingsPress },
    { icon: 'paper-plane-outline' as const, label: 'Invite', onPress: handleInvitePress },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchProgram(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Hero Header ──────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.programIcon}>
            <Text style={styles.programIconText}>
              {program.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.programInfo}>
            <Text style={styles.programName}>{program.name}</Text>
            <Text style={styles.programMeta}>
              {program._count.memberships} members
            </Text>
          </View>
        </View>

        {/* ── Collapsible Description ──────────────── */}
        {program.description ? (
          <TouchableOpacity
            style={styles.descriptionContainer}
            onPress={() => setDescExpanded(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text
              style={styles.description}
              numberOfLines={descExpanded ? undefined : 2}
            >
              {program.description}
            </Text>
            {program.description.length > 100 && (
              <Text style={styles.readMore}>
                {descExpanded ? 'Show less' : 'Read more'}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* ── Action Strip ─────────────────────────── */}
        <View style={styles.actionStrip}>
          {actionButtons.map(btn => (
            <TouchableOpacity
              key={btn.label}
              style={styles.actionBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                btn.onPress();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconCircle}>
                <Ionicons name={btn.icon} size={22} color={colors.primary} />
              </View>
              <Text style={styles.actionLabel}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Channels ─────────────────────────────── */}
        <View style={styles.channelsSection}>
          <Text style={styles.sectionTitle}>Channels</Text>

          {/* Uncategorized channels first */}
          {channels.length > 0 && (
            <View style={styles.uncategorizedChannels}>
              {channels.map(renderChannel)}
            </View>
          )}

          {/* Categories */}
          {categories.map(renderCategory)}

          {/* Empty state */}
          {categories.length === 0 && channels.length === 0 && (
            <View style={styles.emptyChannels}>
              <Ionicons name="chatbubble-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No channels yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
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
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  goBackButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goBackButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },

  // ── Hero Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  programIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  programIconText: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  programInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  programName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  programMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // ── Description ──
  descriptionContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
    minHeight: 44,
  },
  description: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  readMore: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },

  // ── Action Strip ──
  actionStrip: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
  },
  actionBtn: {
    alignItems: 'center',
    minWidth: 60,
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },

  // ── Channels Section ──
  channelsSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  uncategorizedChannels: {
    marginBottom: spacing.md,
  },
  categoryContainer: {
    marginBottom: spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  categoryName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  categoryCountBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  categoryCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  channelList: {
    marginLeft: spacing.md,
  },

  // ── Channel Row ──
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: 2,
    minHeight: 44,
  },
  channelIconWrap: {
    width: 24,
    alignItems: 'center',
  },
  channelHash: {
    fontSize: 17,
    fontWeight: typography.fontWeight.semibold,
    color: colors.channelText,
  },
  channelHashUnread: {
    color: colors.text,
  },
  channelInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  channelName: {
    fontSize: typography.fontSize.md,
    color: colors.channelTextHover,
  },
  channelNameUnread: {
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  channelTopic: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
  },
  mentionBadge: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.lg,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginLeft: spacing.sm,
  },
  mentionBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  emptyChannels: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
});
