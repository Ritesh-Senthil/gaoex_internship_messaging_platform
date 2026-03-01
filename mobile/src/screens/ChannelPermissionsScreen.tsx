/**
 * Channel Permissions Screen
 * Manage who can access a private channel
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList, Role, ProgramMember } from '../types';
import { programApi, roleApi } from '../services/api';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChannelPermissions'>;
type RouteProps = RouteProp<RootStackParamList, 'ChannelPermissions'>;

interface PermissionOverride {
  id: string;
  role?: { id: string; name: string; color: string };
  user?: { id: string; displayName: string; avatarUrl: string | null };
}

export default function ChannelPermissionsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, channelId, channelName } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const [channel, setChannel] = useState<{ id: string; name: string; isPrivate: boolean } | null>(null);
  const [currentPermissions, setCurrentPermissions] = useState<PermissionOverride[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [allMembers, setAllMembers] = useState<ProgramMember[]>([]);
  
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);

  const fetchData = useCallback(async (showFullScreenLoading = true) => {
    try {
      setError(null);
      if (showFullScreenLoading) setLoading(true);
      const [permResponse, rolesResponse, membersResponse] = await Promise.all([
        programApi.getChannelPermissions(programId, channelId),
        roleApi.getRoles(programId),
        programApi.getMembers(programId),
      ]);

      if (permResponse.success) {
        setChannel(permResponse.data.channel);
        setCurrentPermissions(permResponse.data.permissions);
        
        // Initialize selected IDs from current permissions
        const roleIds = new Set<string>();
        const userIds = new Set<string>();
        permResponse.data.permissions.forEach((p: PermissionOverride) => {
          if (p.role) roleIds.add(p.role.id);
          if (p.user) userIds.add(p.user.id);
        });
        setSelectedRoleIds(roleIds);
        setSelectedUserIds(userIds);
      }

      if (rolesResponse.success) {
        // Filter out @everyone role and sort by tier
        setAllRoles(rolesResponse.data.roles.filter((r: Role) => !r.isEveryone));
      }

      if (membersResponse.success) {
        setAllMembers(membersResponse.data.members);
      }
    } catch (err: any) {
      const message = 'Failed to load channel permissions';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [programId, channelId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData(false);
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roleId)) {
        newSet.delete(roleId);
      } else {
        newSet.add(roleId);
      }
      return newSet;
    });
    setHasChanges(true);
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await programApi.setChannelPermissions(
        programId,
        channelId,
        Array.from(selectedRoleIds),
        Array.from(selectedUserIds)
      );
      Alert.alert('Success', 'Channel permissions updated');
      setHasChanges(false);
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="lock-closed" size={20} color={colors.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Private Channel Access</Text>
            <Text style={styles.infoText}>
              Select roles and members who can view and post in #{channelName}.
              Owners and Admins always have access.
            </Text>
          </View>
        </View>

        {/* Roles Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ROLES ({selectedRoleIds.size} selected)</Text>
          <View style={styles.sectionContent}>
            {allRoles.length === 0 ? (
              <Text style={styles.emptyText}>No roles available</Text>
            ) : (
              allRoles.map((role) => (
                <TouchableOpacity
                  key={role.id}
                  style={[
                    styles.itemRow,
                    selectedRoleIds.has(role.id) && styles.itemRowSelected,
                  ]}
                  onPress={() => toggleRole(role.id)}
                >
                  <View style={styles.itemInfo}>
                    <View style={[styles.roleColor, { backgroundColor: role.color }]} />
                    <Text style={styles.itemName}>{role.name}</Text>
                    {role.tier <= 1 && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Admin</Text>
                      </View>
                    )}
                  </View>
                  <View style={[
                    styles.checkbox,
                    selectedRoleIds.has(role.id) && styles.checkboxSelected,
                  ]}>
                    {selectedRoleIds.has(role.id) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INDIVIDUAL MEMBERS ({selectedUserIds.size} selected)</Text>
          <Text style={styles.sectionSubtitle}>
            Add specific members who aren't covered by role permissions
          </Text>
          <View style={styles.sectionContent}>
            {allMembers.length === 0 ? (
              <Text style={styles.emptyText}>No members available</Text>
            ) : (
              allMembers.map((member) => (
                <TouchableOpacity
                  key={member.userId}
                  style={[
                    styles.itemRow,
                    selectedUserIds.has(member.userId) && styles.itemRowSelected,
                  ]}
                  onPress={() => toggleUser(member.userId)}
                >
                  <View style={styles.itemInfo}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {member.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.itemName}>{member.displayName}</Text>
                      {member.isOwner && (
                        <Text style={styles.ownerText}>Program Owner</Text>
                      )}
                    </View>
                  </View>
                  <View style={[
                    styles.checkbox,
                    selectedUserIds.has(member.userId) && styles.checkboxSelected,
                  ]}>
                    {selectedUserIds.has(member.userId) && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      {hasChanges && (
        <View style={styles.saveBar}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.disabledButton]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  retryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl + 60, // Extra padding for save bar
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: colors.primary + '20',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '50',
  },
  infoIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.xs,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.md,
  },
  sectionContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    padding: spacing.md,
    fontStyle: 'italic',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowSelected: {
    backgroundColor: colors.primary + '10',
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  roleColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  itemName: {
    color: colors.text,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  ownerText: {
    color: colors.warning,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: colors.warning + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.sm,
  },
  adminBadgeText: {
    color: colors.warning,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    minHeight: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
});
