/**
 * Roles List Screen
 * Shows all roles in a program grouped by tier
 */

import React, { useEffect, useState, useCallback } from 'react';
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
import { RootStackParamList, Role, TIER_NAMES, RoleTier } from '../types';
import { roleApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RolesList'>;

interface RoleSection {
  tier: number;
  title: string;
  data: Role[];
}

export default function RolesListScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId } = route.params;

  const [roles, setRoles] = useState<Role[]>([]);
  const [sections, setSections] = useState<RoleSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await roleApi.getRoles(programId);

      if (response.success) {
        const fetchedRoles = response.data.roles;
        setRoles(fetchedRoles);

        // Group by tier
        const grouped: Record<number, Role[]> = {};
        fetchedRoles.forEach(role => {
          const tier = role.tier ?? 3;
          if (!grouped[tier]) grouped[tier] = [];
          grouped[tier].push(role);
        });

        // Create sections
        const sectionData: RoleSection[] = Object.entries(grouped)
          .map(([tier, roles]) => ({
            tier: parseInt(tier),
            title: TIER_NAMES[parseInt(tier) as RoleTier] || `Tier ${tier}`,
            data: roles,
          }))
          .sort((a, b) => a.tier - b.tier);

        setSections(sectionData);
      }
    } catch (err: any) {
      console.error('Failed to fetch roles:', err);
      setError(err.message || 'Failed to load roles');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleRolePress = (role: Role) => {
    navigation.navigate('RoleDetail', {
      programId,
      roleId: role.id,
      roleName: role.name,
    });
  };

  const handleCreateRole = () => {
    navigation.navigate('CreateRole', { programId });
  };

  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 0: return '#FFD700'; // Gold for Owner
      case 1: return '#E74C3C'; // Red for Admin
      case 2: return '#3498DB'; // Blue for Moderator
      case 3: return '#95A5A6'; // Gray for Member
      default: return colors.textMuted;
    }
  };

  const renderRole = ({ item }: { item: Role }) => (
    <TouchableOpacity
      style={styles.roleItem}
      onPress={() => handleRolePress(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.roleColor, { backgroundColor: item.color }]} />
      <View style={styles.roleInfo}>
        <Text style={[styles.roleName, { color: item.color }]}>
          {item.name}
        </Text>
        <View style={styles.roleMeta}>
          <Text style={styles.memberCount}>
            {item.memberCount || 0} {(item.memberCount || 0) === 1 ? 'member' : 'members'}
          </Text>
          {item.isEveryone && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: RoleSection }) => (
    <View style={[styles.sectionHeader, { borderLeftColor: getTierColor(section.tier) }]}>
      <Text style={[styles.sectionTitle, { color: getTierColor(section.tier) }]}>
        {section.title}
      </Text>
      <Text style={styles.sectionDescription}>
        {section.tier === 0 && 'Full control'}
        {section.tier === 1 && 'Can manage Moderators & Members'}
        {section.tier === 2 && 'Can manage Members'}
        {section.tier === 3 && 'Cannot manage roles'}
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
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchRoles()}>
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
        renderItem={renderRole}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchRoles(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {roles.length} {roles.length === 1 ? 'role' : 'roles'}
              </Text>
              <Text style={styles.headerSubtitle}>
                Roles are organized by authority level
              </Text>
            </View>
            
            {/* Super Admin Info Section */}
            <View style={[styles.superAdminSection]}>
              <View style={styles.superAdminHeader}>
                <Text style={styles.superAdminIcon}>⭐</Text>
                <Text style={styles.superAdminTitle}>Super Admin</Text>
              </View>
              <Text style={styles.superAdminDescription}>
                Super Admins have full access to all programs and can manage all roles regardless of tier. This is a system-level privilege, not an assignable role.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No roles found</Text>
          </View>
        }
      />

      {/* Create Role FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleCreateRole}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
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
    paddingBottom: spacing.xxxl + 60,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: typography.fontWeight.semibold,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  superAdminSection: {
    backgroundColor: '#FFD700' + '15',
    borderLeftWidth: 4,
    borderLeftColor: '#FFD700',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  superAdminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  superAdminIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  superAdminTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: '#FFD700',
    textTransform: 'uppercase',
  },
  superAdminDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  sectionHeader: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderLeftWidth: 4,
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    textTransform: 'uppercase',
  },
  sectionDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  roleColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.md,
  },
  roleInfo: {
    flex: 1,
  },
  roleName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  roleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  memberCount: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  defaultBadge: {
    backgroundColor: colors.accent + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  defaultBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.medium,
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
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
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 32,
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
    marginTop: -2,
  },
});
