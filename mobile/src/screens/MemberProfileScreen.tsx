/**
 * Member Profile Screen
 * Shows detailed profile of a program member with Discord-style profile card
 * Uses real-time socket events for role & profile updates
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import { RootStackParamList, ProgramMember } from '../types';
import { programApi, conversationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  joinProgram,
  leaveProgram,
  subscribeToMemberRoleEvents,
  subscribeToPresenceEvents,
  MemberRoleChangedEventData,
  UserOnlineEventData,
  UserOfflineEventData,
  UserProfileUpdatedEventData,
} from '../services/socket';
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from '../components/UserAvatar';
import MarkdownText from '../components/MarkdownText';

// ─── Layout Constants ────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_MARGIN = spacing.lg;
const BANNER_HEIGHT = 100;
const AVATAR_SIZE = 84;
const AVATAR_BORDER = 4;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const DEFAULT_BANNER_COLOR = colors.primary;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'MemberProfile'>;

export default function MemberProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, memberId, userId: paramUserId } = route.params;
  const { user } = useAuthStore();

  const [member, setMember] = useState<ProgramMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [isSendingDM, setIsSendingDM] = useState(false);

  // Store member's userId for socket event comparison
  const memberUserIdRef = useRef<string | null>(null);

  const fetchMember = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Look up by memberId (membership ID) or by userId
      const response = memberId
        ? await programApi.getMember(programId, memberId)
        : await programApi.getMemberByUserId(programId, paramUserId!);

      if (response.success) {
        setMember(response.data.member);
        memberUserIdRef.current = response.data.member.userId;
        setAvatarLoadError(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load member profile');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId, memberId, paramUserId]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  // Subscribe to member role changes for real-time updates
  useEffect(() => {
    joinProgram(programId);

    const unsubscribe = subscribeToMemberRoleEvents({
      onMemberRoleChanged: (data: MemberRoleChangedEventData) => {
        if (data.programId !== programId) return;
        if (!memberUserIdRef.current || data.userId !== memberUserIdRef.current) return;

        setMember(prev => {
          if (!prev) return prev;
          return { ...prev, roles: data.roles.map(r => ({ id: r.id, name: r.name, color: r.color || colors.roleDefault })) };
        });
      },
    });

    return () => {
      leaveProgram(programId);
      unsubscribe();
    };
  }, [programId]);

  // Subscribe to presence events for online status and profile updates
  useEffect(() => {
    const unsubscribe = subscribeToPresenceEvents({
      onUserOnline: (data: UserOnlineEventData) => {
        if (!memberUserIdRef.current || data.userId !== memberUserIdRef.current) return;
        setMember(prev => (prev ? { ...prev, isOnline: true } : prev));
      },
      onUserOffline: (data: UserOfflineEventData) => {
        if (!memberUserIdRef.current || data.userId !== memberUserIdRef.current) return;
        setMember(prev =>
          prev ? { ...prev, isOnline: false, lastSeenAt: new Date().toISOString() } : prev,
        );
      },
      onUserProfileUpdated: (data: UserProfileUpdatedEventData) => {
        if (!memberUserIdRef.current || data.userId !== memberUserIdRef.current) return;
        setMember(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            displayName: data.displayName || prev.displayName,
            avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : prev.avatarUrl,
            bio: data.bio !== undefined ? data.bio : prev.bio,
            bannerColor: data.bannerColor !== undefined ? data.bannerColor : prev.bannerColor,
            statusEmoji: data.statusEmoji !== undefined ? data.statusEmoji : prev.statusEmoji,
            statusText: data.statusText !== undefined ? data.statusText : prev.statusText,
            statusExpiresAt:
              data.statusExpiresAt !== undefined ? data.statusExpiresAt : prev.statusExpiresAt,
          };
        });
      },
    });

    return () => unsubscribe();
  }, []);

  // ── Send Message (open / create 1-on-1 DM) ──
  const handleSendMessage = useCallback(async () => {
    if (!member?.userId || isSendingDM) return;
    // Don't DM yourself
    if (member.userId === user?.id) return;

    setIsSendingDM(true);
    try {
      const res = await conversationApi.createConversation([member.userId]);
      if (res.success) {
        navigation.navigate('Conversation', {
          conversationId: res.data.conversation.id,
          name: member.displayName,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start conversation');
    } finally {
      setIsSendingDM(false);
    }
  }, [member?.userId, member?.displayName, user?.id, isSendingDM, navigation]);

  const AWAY_TIMEOUT_SECONDS = 300;

  const getStatusInfo = (m: ProgramMember) => {
    const lastSeen = new Date(m.lastSeenAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;
    const diffMinutes = diffSeconds / 60;
    const diffHours = diffMinutes / 60;
    const diffDays = diffHours / 24;

    if (m.isOnline && diffSeconds < AWAY_TIMEOUT_SECONDS) {
      return { color: colors.online, text: 'Online' };
    }
    if (m.isOnline && diffSeconds >= AWAY_TIMEOUT_SECONDS) {
      const awayTime =
        diffSeconds < 60
          ? `${Math.floor(diffSeconds)} sec`
          : diffMinutes < 60
            ? `${Math.floor(diffMinutes)} min`
            : `${Math.floor(diffHours)} hours`;
      return { color: colors.idle, text: `Away (${awayTime})` };
    }
    if (diffMinutes < 1) return { color: colors.offline, text: 'Offline - Just now' };
    if (diffMinutes < 60)
      return { color: colors.offline, text: `Offline - ${Math.floor(diffMinutes)} min ago` };
    if (diffDays < 1)
      return { color: colors.offline, text: `Offline - ${Math.floor(diffHours)} hours ago` };
    if (diffDays < 7)
      return { color: colors.offline, text: `Offline - ${Math.floor(diffDays)} days ago` };
    return { color: colors.offline, text: `Offline - ${lastSeen.toLocaleDateString()}` };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Derived
  const bannerColor = member?.bannerColor || DEFAULT_BANNER_COLOR;
  const hasCustomStatus = !!(member?.statusEmoji || member?.statusText);
  const isStatusExpired = useMemo(() => {
    if (!member?.statusExpiresAt) return false;
    return new Date(member.statusExpiresAt).getTime() <= Date.now();
  }, [member?.statusExpiresAt]);
  const showStatus = hasCustomStatus && !isStatusExpired;

  // ─── Loading / Error states ───────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !member) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
        <Text style={styles.errorText}>{error || 'Member not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchMember()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusInfo = getStatusInfo(member);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchMember(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Profile Card ─────────────────────────── */}
        <View style={styles.profileCard}>
          {/* Banner */}
          <View style={[styles.banner, { backgroundColor: bannerColor }]} />

          {/* Avatar — overlaps banner */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarRing}>
              <UserAvatar
                name={member.displayName}
                avatarUrl={member.avatarUrl}
                size={AVATAR_SIZE}
              />
            </View>

            {/* Badges */}
            <View style={styles.badgeRow}>
              {member.isOwner && (
                <View style={[styles.pill, { backgroundColor: colors.accent }]}>
                  <Text style={styles.pillText}>OWNER</Text>
                </View>
              )}
              {member.isSuperAdmin && !member.isOwner && (
                <View style={[styles.pill, { backgroundColor: colors.accent }]}>
                  <Text style={styles.pillText}>ADMIN</Text>
                </View>
              )}
            </View>
          </View>

          {/* Identity */}
          <View style={styles.identitySection}>
            <Text style={styles.displayName}>
              {member.nickname || member.displayName}
            </Text>
            {member.nickname && (
              <Text style={styles.realName}>{member.displayName}</Text>
            )}
            <Text style={styles.email}>{member.email}</Text>
          </View>

          {/* Online status badge */}
          <View style={styles.presencePill}>
            <View style={[styles.presenceDot, { backgroundColor: statusInfo.color }]} />
            <Text style={[styles.presenceText, { color: statusInfo.color }]}>
              {statusInfo.text}
            </Text>
          </View>

          {/* Custom status */}
          {showStatus && (
            <View style={styles.customStatusPill}>
              {member.statusEmoji ? (
                <Text style={styles.customStatusEmoji}>{member.statusEmoji}</Text>
              ) : null}
              {member.statusText ? (
                <Text style={styles.customStatusText} numberOfLines={1}>
                  {member.statusText}
                </Text>
              ) : null}
            </View>
          )}

          {/* Bio divider + content */}
          {member.bio ? (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.bioSection}>
                <Text style={styles.bioLabel}>ABOUT ME</Text>
                <MarkdownText style={styles.bioText}>{member.bio}</MarkdownText>
              </View>
            </>
          ) : (
            <View style={{ height: spacing.lg }} />
          )}
        </View>

        {/* ── Roles Section ────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Roles</Text>
            <TouchableOpacity
              style={styles.assignRolesButton}
              onPress={() =>
                navigation.navigate('AssignRoles', {
                  programId,
                  memberId: memberId || member.id,
                  memberName: member.displayName,
                })
              }
            >
              <Text style={styles.assignRolesText}>Manage</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rolesContainer}>
            {member.roles.length === 0 ? (
              <Text style={styles.noRolesText}>No roles assigned</Text>
            ) : (
              member.roles.map(role => (
                <View
                  key={role.id}
                  style={[styles.roleBadge, { backgroundColor: role.color + '30' }]}
                >
                  <View style={[styles.roleColor, { backgroundColor: role.color }]} />
                  <Text style={[styles.roleText, { color: role.color }]}>{role.name}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* ── Info Section ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{member.email}</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Joined Program</Text>
            <Text style={styles.infoValue}>{formatDate(member.joinedAt)}</Text>
          </View>

          {member.accountCreatedAt && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Account Created</Text>
              <Text style={styles.infoValue}>{formatDate(member.accountCreatedAt)}</Text>
            </View>
          )}
        </View>

        {/* ── Actions Section ──────────────────────── */}
        {member.userId !== user?.id && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>

            <TouchableOpacity
              style={[styles.actionButton, isSendingDM && { opacity: 0.6 }]}
              onPress={handleSendMessage}
              disabled={isSendingDM}
              activeOpacity={0.7}
            >
              {isSendingDM ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.md }} />
              ) : (
                <Ionicons name="chatbubble-outline" size={20} color={colors.primary} style={{ marginRight: spacing.md }} />
              )}
              <Text style={styles.actionText}>Send Message</Text>
            </TouchableOpacity>
          </View>
        )}
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
  content: {
    paddingBottom: spacing.xxl,
  },

  // ═══════════════════════════════════════════════
  // ██  PROFILE CARD  ████████████████████████████
  // ═══════════════════════════════════════════════
  profileCard: {
    marginHorizontal: CARD_MARGIN,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden',
    ...shadows.md,
  },
  banner: {
    height: BANNER_HEIGHT,
    width: '100%',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginTop: -AVATAR_OVERLAP,
  },
  avatarRing: {
    width: AVATAR_SIZE + AVATAR_BORDER * 2,
    height: AVATAR_SIZE + AVATAR_BORDER * 2,
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
    borderWidth: AVATAR_BORDER,
    borderColor: colors.backgroundSecondary,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    marginLeft: 'auto',
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  pillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.background,
    letterSpacing: 0.5,
  },

  // ── Identity ──────────────────────────────────
  identitySection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  displayName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  realName: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  email: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Presence ──────────────────────────────────
  presencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  presenceText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },

  // ── Custom status ─────────────────────────────
  customStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  customStatusEmoji: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  customStatusText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  // ── Bio ───────────────────────────────────────
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  bioSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  bioLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  bioText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  // ═══════════════════════════════════════════════
  // ██  SECTIONS  ████████████████████████████████
  // ═══════════════════════════════════════════════
  section: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  assignRolesButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    minHeight: 36,
  },
  assignRolesText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  roleColor: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  roleText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  noRolesText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
  },
  actionText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
});
