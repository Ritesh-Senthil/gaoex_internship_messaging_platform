/**
 * Assign Roles Screen
 * Manage roles for a specific member
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Role, ProgramMember } from '../types';
import { roleApi, programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'AssignRoles'>;

export default function AssignRolesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, memberId, memberName } = route.params;

  const [roles, setRoles] = useState<Role[]>([]);
  const [memberRoleIds, setMemberRoleIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingRoleId, setProcessingRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const [rolesResponse, memberResponse] = await Promise.all([
        roleApi.getRoles(programId),
        programApi.getMember(programId, memberId),
      ]);

      if (rolesResponse.success) {
        // Filter out @everyone role - it's auto-assigned
        setRoles(rolesResponse.data.roles.filter(r => !r.isEveryone));
      }

      if (memberResponse.success) {
        const member = memberResponse.data.member;
        const roleIds = new Set(member.roles?.map((r: any) => r.id) || []);
        setMemberRoleIds(roleIds);
      }
    } catch (err: any) {
      console.error('Failed to fetch data:', err);
      setError(err.message || 'Failed to load roles');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId, memberId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleRole = async (role: Role) => {
    if (processingRoleId) return;

    const hasRole = memberRoleIds.has(role.id);
    setProcessingRoleId(role.id);

    try {
      if (hasRole) {
        // Remove role
        await roleApi.removeRole(programId, memberId, role.id);
        setMemberRoleIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(role.id);
          return newSet;
        });
      } else {
        // Assign role
        await roleApi.assignRole(programId, memberId, role.id);
        setMemberRoleIds(prev => new Set(prev).add(role.id));
      }
    } catch (err: any) {
      console.error('Failed to toggle role:', err);
      Alert.alert(
        'Error',
        err.response?.data?.error?.message || `Failed to ${hasRole ? 'remove' : 'assign'} role`
      );
    } finally {
      setProcessingRoleId(null);
    }
  };

  const renderRole = ({ item }: { item: Role }) => {
    const hasRole = memberRoleIds.has(item.id);
    const isProcessing = processingRoleId === item.id;

    return (
      <TouchableOpacity
        style={styles.roleItem}
        onPress={() => toggleRole(item)}
        activeOpacity={0.7}
        disabled={isProcessing}
      >
        <View style={styles.roleInfo}>
          <View style={styles.roleHeader}>
            <View style={[styles.roleColor, { backgroundColor: item.color }]} />
            <Text style={[styles.roleName, { color: item.color }]}>
              {item.name}
            </Text>
          </View>
          <Text style={styles.roleMeta}>
            {item.memberCount || 0} {(item.memberCount || 0) === 1 ? 'member' : 'members'}
          </Text>
        </View>

        <View style={styles.checkboxContainer}>
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <View
              style={[
                styles.checkbox,
                hasRole && styles.checkboxChecked,
              ]}
            >
              {hasRole && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
        </View>
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
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={roles}
        keyExtractor={(item) => item.id}
        renderItem={renderRole}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchData(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              Manage roles for {memberName}
            </Text>
            <Text style={styles.headerSubtitle}>
              Tap a role to assign or remove it
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No roles available</Text>
            <Text style={styles.emptySubtext}>
              Create roles in the Roles section first
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          Note: The @everyone role is automatically assigned to all members
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
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
    flexGrow: 1,
    paddingBottom: spacing.md,
  },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roleInfo: {
    flex: 1,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleColor: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.sm,
  },
  roleName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  roleMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginLeft: 22, // Align with role name
  },
  checkboxContainer: {
    width: 40,
    alignItems: 'center',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 16,
    fontWeight: typography.fontWeight.bold,
  },
  emptyContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  footerNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  doneButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
});
