/**
 * Member Profile Screen
 * Shows detailed profile of a program member
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, ProgramMember } from '../types';
import { programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'MemberProfile'>;

export default function MemberProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, memberId } = route.params;

  const [member, setMember] = useState<ProgramMember | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMember = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await programApi.getMember(programId, memberId);

      if (response.success) {
        setMember(response.data.member);
      }
    } catch (err: any) {
      console.error('Failed to fetch member:', err);
      setError(err.message || 'Failed to load member profile');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId, memberId]);

  useEffect(() => {
    fetchMember();
  }, [fetchMember]);

  const getAvatarColor = (name: string) => {
    const colorList = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colorList.length;
    return colorList[index];
  };

  // Away timeout in seconds (30 seconds for testing, change to 300 for production = 5 min)
  const AWAY_TIMEOUT_SECONDS = 30;
  
  const getStatusInfo = (member: ProgramMember) => {
    const lastSeen = new Date(member.lastSeenAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;
    const diffMinutes = diffSeconds / 60;
    const diffHours = diffMinutes / 60;
    const diffDays = diffHours / 24;
    
    // Online and active within timeout
    if (member.isOnline && diffSeconds < AWAY_TIMEOUT_SECONDS) {
      return { color: colors.online, text: 'Online' };
    }
    
    // Online but inactive > timeout (Away)
    if (member.isOnline && diffSeconds >= AWAY_TIMEOUT_SECONDS) {
      const awayTime = diffSeconds < 60 
        ? `${Math.floor(diffSeconds)} sec`
        : diffMinutes < 60 
          ? `${Math.floor(diffMinutes)} min` 
          : `${Math.floor(diffHours)} hours`;
      return { color: colors.idle, text: `Away (${awayTime})` };
    }
    
    // Offline - show last seen time
    if (diffMinutes < 1) {
      return { color: colors.offline, text: 'Offline - Just now' };
    }
    if (diffMinutes < 60) {
      return { color: colors.offline, text: `Offline - ${Math.floor(diffMinutes)} min ago` };
    }
    if (diffDays < 1) {
      return { color: colors.offline, text: `Offline - ${Math.floor(diffHours)} hours ago` };
    }
    if (diffDays < 7) {
      return { color: colors.offline, text: `Offline - ${Math.floor(diffDays)} days ago` };
    }
    
    return { color: colors.offline, text: `Offline - ${lastSeen.toLocaleDateString()}` };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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
        <Text style={styles.errorEmoji}>😕</Text>
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
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(member.displayName) }]}>
              <Text style={styles.avatarText}>
                {member.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          </View>

          <Text style={styles.displayName}>
            {member.nickname || member.displayName}
            {member.isOwner && ' 👑'}
            {member.isSuperAdmin && !member.isOwner && ' ⭐'}
          </Text>

          {member.nickname && (
            <Text style={styles.realName}>{member.displayName}</Text>
          )}

          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + '20' }]}>
            <View style={[styles.statusIndicator, { backgroundColor: statusInfo.color }]} />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.text}
            </Text>
          </View>
        </View>

        {/* Roles Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Roles</Text>
            <TouchableOpacity
              style={styles.assignRolesButton}
              onPress={() => navigation.navigate('AssignRoles', {
                programId,
                memberId,
                memberName: member.displayName,
              })}
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
                  <Text style={[styles.roleText, { color: role.color }]}>
                    {role.name}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Info Section */}
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

          {member.isOwner && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Role</Text>
              <Text style={styles.infoValue}>Program Owner</Text>
            </View>
          )}

          {member.isSuperAdmin && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Platform Role</Text>
              <Text style={styles.infoValue}>Super Admin</Text>
            </View>
          )}
        </View>

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Send Message</Text>
          </TouchableOpacity>
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
  content: {
    paddingBottom: spacing.xxl,
  },
  profileHeader: {
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: colors.background,
  },
  displayName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  realName: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginTop: spacing.md,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
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
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
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
  },
  actionIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  actionText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
});
