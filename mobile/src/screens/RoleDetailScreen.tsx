/**
 * Role Detail Screen
 * Shows role details with tier-based editing
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, RoleDetail, Permission, RoleTier, TIER_NAMES } from '../types';
import { roleApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'RoleDetail'>;

const ROLE_COLORS = [
  '#99AAB5', '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6',
  '#E91E63', '#F1C40F', '#E67E22', '#E74C3C', '#95A5A6',
];

const TIER_OPTIONS: { tier: RoleTier; name: string; description: string; color: string }[] = [
  { tier: 1, name: 'Admin', description: 'Can manage Moderators & Members', color: '#E74C3C' },
  { tier: 2, name: 'Moderator', description: 'Can manage Members only', color: '#3498DB' },
  { tier: 3, name: 'Member', description: 'Cannot manage roles', color: '#95A5A6' },
];

export default function RoleDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, roleId, roleName } = route.params;

  const [role, setRole] = useState<RoleDetail | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#99AAB5');
  const [editTier, setEditTier] = useState<RoleTier>(3);
  const [editPermissions, setEditPermissions] = useState<Set<string>>(new Set());
  const [editHoisted, setEditHoisted] = useState(false);
  const [editMentionable, setEditMentionable] = useState(false);

  const fetchRole = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      const [roleResponse, permsResponse] = await Promise.all([
        roleApi.getRole(programId, roleId),
        roleApi.getPermissions(),
      ]);

      if (roleResponse.success) {
        const roleData = roleResponse.data.role;
        setRole(roleData);
        setEditName(roleData.name);
        setEditColor(roleData.color);
        setEditTier((roleData.tier ?? 3) as RoleTier);
        setEditHoisted(roleData.isHoisted);
        setEditMentionable(roleData.isMentionable);
        setEditPermissions(new Set(roleData.permissionNames || []));
      }

      if (permsResponse.success) {
        setPermissions(permsResponse.data.permissions);
      }
    } catch (err: any) {
      console.error('Failed to fetch role:', err);
      setError(err.message || 'Failed to load role');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId, roleId]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  useEffect(() => {
    if (role) {
      navigation.setOptions({ title: role.name });
    }
  }, [role, navigation]);

  const handleTierChange = (newTier: RoleTier) => {
    setEditTier(newTier);
    // Remove permissions not allowed for new tier
    const newPerms = new Set<string>();
    editPermissions.forEach(permKey => {
      const perm = permissions.find(p => p.key === permKey);
      if (!perm?.minTier || perm.minTier >= newTier) {
        newPerms.add(permKey);
      }
    });
    setEditPermissions(newPerms);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Role name is required');
      return;
    }

    setIsSaving(true);

    try {
      const response = await roleApi.updateRole(programId, roleId, {
        name: editName.trim(),
        color: editColor,
        tier: editTier,
        permissions: Array.from(editPermissions),
        isHoisted: editHoisted,
        isMentionable: editMentionable,
      });

      if (response.success) {
        Alert.alert('Success', 'Role updated successfully');
        setIsEditing(false);
        fetchRole();
      }
    } catch (err: any) {
      console.error('Failed to update role:', err);
      Alert.alert('Error', err.response?.data?.error?.message || 'Failed to update role');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (role?.isEveryone) {
      Alert.alert('Error', 'Cannot delete the @everyone role');
      return;
    }

    Alert.alert(
      'Delete Role',
      `Are you sure you want to delete "${role?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await roleApi.deleteRole(programId, roleId);
              Alert.alert('Success', 'Role deleted');
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error?.message || 'Failed to delete role');
            }
          },
        },
      ]
    );
  };

  const togglePermission = (permKey: string) => {
    const perm = permissions.find(p => p.key === permKey);
    if (perm?.minTier !== undefined && perm.minTier < editTier) {
      Alert.alert('Not Available', `Requires ${TIER_NAMES[perm.minTier as RoleTier]} tier`);
      return;
    }

    const newPerms = new Set(editPermissions);
    if (newPerms.has(permKey)) newPerms.delete(permKey);
    else newPerms.add(permKey);
    setEditPermissions(newPerms);
  };

  const isPermissionAllowed = (perm: Permission): boolean => {
    return !perm.minTier || perm.minTier >= editTier;
  };

  const getTierColor = (tier: number): string => {
    switch (tier) {
      case 0: return '#FFD700';
      case 1: return '#E74C3C';
      case 2: return '#3498DB';
      case 3: return '#95A5A6';
      default: return colors.textMuted;
    }
  };

  const renderPermissionsByCategory = (category: string) => {
    const categoryPerms = permissions.filter(p => p.category === category);
    
    return (
      <View key={category} style={styles.permCategory}>
        <Text style={styles.permCategoryTitle}>{category}</Text>
        {categoryPerms.map(perm => {
          const allowed = isPermissionAllowed(perm);
          return (
            <TouchableOpacity
              key={perm.key}
              style={[styles.permItem, !allowed && styles.permItemDisabled]}
              onPress={() => isEditing && togglePermission(perm.key)}
              disabled={!isEditing || !allowed}
            >
              <View style={styles.permInfo}>
                <Text style={[styles.permName, !allowed && styles.permNameDisabled]}>
                  {perm.name}
                </Text>
                <Text style={styles.permDesc}>{perm.description}</Text>
              </View>
              <View
                style={[
                  styles.checkbox,
                  editPermissions.has(perm.key) && styles.checkboxChecked,
                  (!isEditing || !allowed) && styles.checkboxDisabled,
                ]}
              >
                {editPermissions.has(perm.key) && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
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

  if (error || !role) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error || 'Role not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchRole()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => fetchRole(true)} tintColor={colors.primary} />
        }
      >
        {/* Role Header */}
        <View style={styles.header}>
          <View style={[styles.roleIcon, { backgroundColor: isEditing ? editColor : role.color }]}>
            <Text style={styles.roleIconText}>
              {(isEditing ? editName : role.name).charAt(0).toUpperCase()}
            </Text>
          </View>
          
          {isEditing && !role.isEveryone ? (
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Role name"
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Text style={[styles.roleName, { color: isEditing ? editColor : role.color }]}>{role.name}</Text>
          )}
          
          {isEditing && role.isEveryone && (
            <Text style={styles.everyoneNote}>
              You can edit color and permissions for @everyone
            </Text>
          )}
          
          <View style={[styles.tierBadge, { backgroundColor: getTierColor(isEditing ? editTier : role.tier) + '20' }]}>
            <Text style={[styles.tierBadgeText, { color: getTierColor(isEditing ? editTier : role.tier) }]}>
              {TIER_NAMES[(isEditing ? editTier : role.tier) as RoleTier]}
            </Text>
          </View>
          
          <Text style={styles.memberCount}>
            {role.memberCount ?? 0} {(role.memberCount ?? 0) === 1 ? 'member' : 'members'}
          </Text>
        </View>

        {/* Tier Selection (when editing) */}
        {isEditing && !role.isEveryone && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Authority Level</Text>
            {TIER_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.tier}
                style={[
                  styles.tierOption,
                  editTier === option.tier && styles.tierOptionSelected,
                  { borderLeftColor: option.color },
                ]}
                onPress={() => handleTierChange(option.tier)}
              >
                <View style={styles.tierRadio}>
                  {editTier === option.tier && <View style={styles.tierRadioInner} />}
                </View>
                <View style={styles.tierInfo}>
                  <Text style={[styles.tierName, { color: option.color }]}>{option.name}</Text>
                  <Text style={styles.tierDesc}>{option.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Color Picker (when editing) - allowed for @everyone too */}
        {isEditing && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Color</Text>
            <View style={styles.colorPicker}>
              {ROLE_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorOption, { backgroundColor: c }, editColor === c && styles.colorOptionSelected]}
                  onPress={() => setEditColor(c)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Settings</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Display separately</Text>
              <Text style={styles.settingDesc}>Show members with this role separately</Text>
            </View>
            <Switch
              value={isEditing ? editHoisted : role.isHoisted}
              onValueChange={setEditHoisted}
              disabled={!isEditing || role.isEveryone}
              trackColor={{ false: colors.surface, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Allow mentions</Text>
              <Text style={styles.settingDesc}>Members can @mention this role</Text>
            </View>
            <Switch
              value={isEditing ? editMentionable : role.isMentionable}
              onValueChange={setEditMentionable}
              disabled={!isEditing || role.isEveryone}
              trackColor={{ false: colors.surface, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          {isEditing && (
            <Text style={styles.sectionHint}>Available permissions depend on authority level</Text>
          )}
          {['Program', 'Channel', 'Member'].map(cat => renderPermissionsByCategory(cat))}
        </View>

        {/* Members Preview */}
        {role.members && role.members.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members with this role</Text>
            <View style={styles.membersPreview}>
              {role.members.slice(0, 5).map(member => (
                <View key={member.id} style={styles.memberChip}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.memberAvatarText}>{member.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                </View>
              ))}
              {(role.memberCount ?? 0) > 5 && (
                <Text style={styles.moreMembers}>+{(role.memberCount ?? 0) - 5} more</Text>
              )}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={() => {
                setIsEditing(false);
                if (role) {
                  setEditName(role.name);
                  setEditColor(role.color);
                  setEditTier((role.tier ?? 3) as RoleTier);
                  setEditPermissions(new Set(role.permissionNames || []));
                  setEditHoisted(role.isHoisted);
                  setEditMentionable(role.isMentionable);
                }
              }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                <Text style={styles.editButtonText}>Edit Role</Text>
              </TouchableOpacity>
              {!role.isEveryone && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: spacing.xl },
  errorEmoji: { fontSize: 48, marginBottom: spacing.md },
  errorText: { fontSize: typography.fontSize.lg, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  retryButton: { backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.md },
  retryButtonText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.white },
  content: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', padding: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  roleIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  roleIconText: { fontSize: 32, fontWeight: typography.fontWeight.bold, color: colors.white },
  roleName: { fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, marginBottom: spacing.xs },
  nameInput: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.semibold, color: colors.text, backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md, textAlign: 'center', minWidth: 200, marginBottom: spacing.xs },
  tierBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, marginBottom: spacing.sm },
  tierBadgeText: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
  memberCount: { fontSize: typography.fontSize.md, color: colors.textSecondary },
  everyoneNote: { fontSize: typography.fontSize.sm, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm, textAlign: 'center' },
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.sm },
  sectionHint: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginBottom: spacing.md },
  tierOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.sm, borderLeftWidth: 4 },
  tierOptionSelected: { backgroundColor: colors.primary + '20' },
  tierRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textMuted, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  tierRadioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  tierInfo: { flex: 1 },
  tierName: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold },
  tierDesc: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },
  colorPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  colorOption: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorOptionSelected: { borderColor: colors.white },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  settingInfo: { flex: 1, marginRight: spacing.md },
  settingName: { fontSize: typography.fontSize.md, color: colors.text, fontWeight: typography.fontWeight.medium },
  settingDesc: { fontSize: typography.fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  permCategory: { marginBottom: spacing.lg },
  permCategoryTitle: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.primary, marginBottom: spacing.sm },
  permItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  permItemDisabled: { opacity: 0.4 },
  permInfo: { flex: 1 },
  permName: { fontSize: typography.fontSize.md, color: colors.text },
  permNameDisabled: { color: colors.textMuted },
  permDesc: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: colors.textMuted, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxDisabled: { opacity: 0.5 },
  checkmark: { color: colors.white, fontSize: 14, fontWeight: typography.fontWeight.bold },
  membersPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  memberChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: borderRadius.full },
  memberAvatar: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs },
  memberAvatarText: { fontSize: 12, fontWeight: typography.fontWeight.bold, color: colors.white },
  memberName: { fontSize: typography.fontSize.sm, color: colors.text },
  moreMembers: { fontSize: typography.fontSize.sm, color: colors.textMuted, alignSelf: 'center' },
  actions: { flexDirection: 'row', padding: spacing.lg, gap: spacing.md },
  editButton: { flex: 1, backgroundColor: colors.primary, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  editButtonText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.white },
  deleteButton: { backgroundColor: colors.error, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', paddingHorizontal: spacing.xl },
  deleteButtonText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.white },
  cancelButton: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  cancelButtonText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.text },
  saveButton: { flex: 1, backgroundColor: colors.success, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  saveButtonText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.semibold, color: colors.white },
  buttonDisabled: { opacity: 0.6 },
});
