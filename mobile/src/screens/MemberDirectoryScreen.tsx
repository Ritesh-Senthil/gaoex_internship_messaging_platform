/**
 * Member Directory Screen
 * Shows all members of a program, grouped by role/admin status
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, ProgramMember } from '../types';
import { programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'MemberDirectory'>;

interface MemberSection {
  title: string;
  color: string;
  data: ProgramMember[];
}

export default function MemberDirectoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, programName } = route.params;

  const [members, setMembers] = useState<ProgramMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await programApi.getMembers(programId);

      if (response.success) {
        setMembers(response.data.members);
      }
    } catch (err: any) {
      console.error('Failed to fetch members:', err);
      setError(err.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Group members into sections
  const sections = useMemo((): MemberSection[] => {
    const superAdmins: ProgramMember[] = [];
    const owners: ProgramMember[] = [];
    const regularMembers: ProgramMember[] = [];

    members.forEach(member => {
      if (member.isSuperAdmin) {
        superAdmins.push(member);
      } else if (member.isOwner) {
        owners.push(member);
      } else {
        regularMembers.push(member);
      }
    });

    const result: MemberSection[] = [];

    if (superAdmins.length > 0) {
      result.push({
        title: 'Super Admin',
        color: '#FFD700', // Gold
        data: superAdmins,
      });
    }

    if (owners.length > 0) {
      result.push({
        title: 'Program Owner',
        color: '#E74C3C', // Red
        data: owners,
      });
    }

    if (regularMembers.length > 0) {
      result.push({
        title: 'Members',
        color: colors.textMuted,
        data: regularMembers,
      });
    }

    return result;
  }, [members]);

  const handleMemberPress = (member: ProgramMember) => {
    navigation.navigate('MemberProfile', {
      programId,
      memberId: member.id,
      memberName: member.displayName,
    });
  };

  // Away timeout in seconds (30 seconds for testing, change to 300 for production = 5 min)
  const AWAY_TIMEOUT_SECONDS = 30;
  
  const getStatusColor = (member: ProgramMember) => {
    if (!member.isOnline) {
      return colors.offline;
    }
    
    const lastSeen = new Date(member.lastSeenAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;
    
    if (diffSeconds < AWAY_TIMEOUT_SECONDS) {
      return colors.online;
    }
    return colors.idle;
  };

  const getAvatarColor = (name: string) => {
    const colorList = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colorList.length;
    return colorList[index];
  };

  const getHighestRole = (member: ProgramMember) => {
    if (member.roles.length === 0) return null;
    return member.roles.reduce((highest, role) => 
      role.position > highest.position ? role : highest
    );
  };

  const renderMember = ({ item }: { item: ProgramMember }) => {
    const highestRole = getHighestRole(item);
    const statusColor = getStatusColor(item);

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onPress={() => handleMemberPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.displayName) }]}>
            <Text style={styles.avatarText}>
              {item.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>

        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {item.nickname || item.displayName}
            </Text>
            {item.isSuperAdmin && <Text style={styles.superAdminBadge}>⭐</Text>}
            {item.isOwner && !item.isSuperAdmin && <Text style={styles.ownerBadge}>👑</Text>}
          </View>
          
          {highestRole && highestRole.name !== '@everyone' && (
            <View style={[styles.roleBadge, { backgroundColor: highestRole.color + '30' }]}>
              <View style={[styles.roleColor, { backgroundColor: highestRole.color }]} />
              <Text style={[styles.roleText, { color: highestRole.color }]}>
                {highestRole.name}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: MemberSection }) => (
    <View style={[styles.sectionHeader, { borderLeftColor: section.color }]}>
      <Text style={[styles.sectionTitle, { color: section.color }]}>
        {section.title}
      </Text>
      <Text style={styles.sectionCount}>
        {section.data.length}
      </Text>
    </View>
  );

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
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchMembers()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchMembers(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.memberCount}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No members found</Text>
          </View>
        }
      />
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
  listContent: {
    paddingBottom: spacing.lg,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: typography.fontWeight.semibold,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderLeftWidth: 4,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.background,
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginRight: spacing.xs,
  },
  superAdminBadge: {
    fontSize: 14,
    marginLeft: spacing.xs,
  },
  ownerBadge: {
    fontSize: 14,
    marginLeft: spacing.xs,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  roleColor: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  roleText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
});
