/**
 * Member Directory Screen
 * Shows all members of a program, grouped by role/admin status
 * Uses real-time socket events for member updates
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
import { Ionicons } from '@expo/vector-icons';
import UserAvatar from '../components/UserAvatar';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, ProgramMember } from '../types';
import { programApi } from '../services/api';
import { 
  joinProgram, 
  leaveProgram,
  subscribeToMemberRoleEvents,
  subscribeToPresenceEvents,
  MemberEventData,
  MemberRoleChangedEventData,
  UserOnlineEventData,
  UserOfflineEventData,
  UserProfileUpdatedEventData,
} from '../services/socket';

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
      setError(err.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Subscribe to member/role events
  useEffect(() => {
    // Join program room to receive member events
    joinProgram(programId);
    
    const unsubscribe = subscribeToMemberRoleEvents({
      onMemberJoined: (data: MemberEventData) => {
        if (data.programId !== programId) return;
        setMembers(prev => {
          // Check if member already exists
          if (prev.some(m => m.userId === data.member.userId)) return prev;
          // Add new member with proper field mapping
          const newMember: ProgramMember = {
            id: data.member.id,
            userId: data.member.userId,
            displayName: data.member.displayName,
            email: '', // Not provided in event
            avatarUrl: data.member.avatarUrl || null,
            nickname: data.member.nickname || null,
            roles: data.member.roles.map(r => ({ id: r.id, name: r.name, color: r.color || colors.roleDefault })),
            joinedAt: data.member.joinedAt,
            isOnline: false,
            lastSeenAt: new Date().toISOString(),
            isSuperAdmin: false,
            isOwner: false,
          };
          return [...prev, newMember];
        });
      },
      onMemberRoleChanged: (data: MemberRoleChangedEventData) => {
        if (data.programId !== programId) return;
        setMembers(prev => prev.map(m => 
          m.userId === data.userId ? { ...m, roles: data.roles.map(r => ({ id: r.id, name: r.name, color: r.color || colors.roleDefault })) } : m
        ));
      },
    });
    
    return () => {
      leaveProgram(programId);
      unsubscribe();
    };
  }, [programId]);

  // Subscribe to presence events for online status updates
  useEffect(() => {
    const unsubscribe = subscribeToPresenceEvents({
      onUserOnline: (data: UserOnlineEventData) => {
        setMembers(prev => prev.map(m => 
          m.userId === data.userId ? { ...m, isOnline: true } : m
        ));
      },
      onUserOffline: (data: UserOfflineEventData) => {
        setMembers(prev => prev.map(m => 
          m.userId === data.userId ? { ...m, isOnline: false, lastSeenAt: new Date().toISOString() } : m
        ));
      },
      onUserProfileUpdated: (data: UserProfileUpdatedEventData) => {
        setMembers(prev => prev.map(m => 
          m.userId === data.userId 
            ? { 
                ...m, 
                displayName: data.displayName || m.displayName,
                avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : m.avatarUrl,
              } 
            : m
        ));
      },
    });
    
    return () => unsubscribe();
  }, []);

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
        color: colors.tierOwner,
        data: superAdmins,
      });
    }

    if (owners.length > 0) {
      result.push({
        title: 'Program Owner',
        color: colors.tierAdmin,
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

  const AWAY_TIMEOUT_SECONDS = 300;
  
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

  const getHighestRole = (member: ProgramMember) => {
    if (member.roles.length === 0) return null;
    // Just return the first role (roles are already ordered by the backend)
    return member.roles[0];
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
          <UserAvatar
            name={item.displayName}
            avatarUrl={item.avatarUrl}
            size={44}
            showStatus
            statusColor={statusColor}
          />
        </View>

        <View style={styles.memberInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {item.nickname || item.displayName}
            </Text>
            {item.isSuperAdmin && <Ionicons name="star" size={14} color={colors.tierOwner} style={{ marginLeft: spacing.xs }} />}
            {item.isOwner && !item.isSuperAdmin && <Ionicons name="shield" size={14} color={colors.tierAdmin} style={{ marginLeft: spacing.xs }} />}
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

        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
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
        <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
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
    backgroundColor: colors.background,
    marginBottom: spacing.xs,
  },
  avatarContainer: {
    marginRight: spacing.md,
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
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
});
