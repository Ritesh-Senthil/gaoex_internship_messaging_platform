/**
 * Create Role Screen
 * Create a new role with tier selection
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, Permission, RoleTier, TIER_NAMES } from '../types';
import { roleApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'CreateRole'>;

const ROLE_COLORS = [
  '#99AAB5', '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6',
  '#E91E63', '#F1C40F', '#E67E22', '#E74C3C', '#95A5A6',
];

const TIER_OPTIONS: { tier: RoleTier; name: string; description: string; color: string }[] = [
  { tier: 1, name: 'Admin', description: 'Can manage Moderators & Members', color: '#E74C3C' },
  { tier: 2, name: 'Moderator', description: 'Can manage Members only', color: '#3498DB' },
  { tier: 3, name: 'Member', description: 'Cannot manage roles', color: '#95A5A6' },
];

export default function CreateRoleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId } = route.params;

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3498DB');
  const [tier, setTier] = useState<RoleTier>(3);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [isHoisted, setIsHoisted] = useState(false);
  const [isMentionable, setIsMentionable] = useState(true);

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      const response = await roleApi.getPermissions();
      if (response.success) {
        setPermissions(response.data.permissions);
      }
    } catch (err) {
      console.error('Failed to fetch permissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Role name is required');
      return;
    }

    setIsCreating(true);

    try {
      const response = await roleApi.createRole(programId, {
        name: name.trim(),
        color,
        tier,
        permissions: Array.from(selectedPermissions),
        isHoisted,
        isMentionable,
      });

      if (response.success) {
        Alert.alert('Success', 'Role created successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err: any) {
      console.error('Failed to create role:', err);
      Alert.alert('Error', err.response?.data?.error?.message || 'Failed to create role');
    } finally {
      setIsCreating(false);
    }
  };

  const togglePermission = (permKey: string) => {
    // Check if permission is allowed for selected tier
    const perm = permissions.find(p => p.key === permKey);
    if (perm?.minTier !== undefined && perm.minTier < tier) {
      Alert.alert(
        'Permission Not Available',
        `This permission requires at least ${TIER_NAMES[perm.minTier as RoleTier]} tier`
      );
      return;
    }

    const newPerms = new Set(selectedPermissions);
    if (newPerms.has(permKey)) {
      newPerms.delete(permKey);
    } else {
      newPerms.add(permKey);
    }
    setSelectedPermissions(newPerms);
  };

  const handleTierChange = (newTier: RoleTier) => {
    setTier(newTier);
    // Remove permissions that aren't allowed for the new tier
    const newPerms = new Set<string>();
    selectedPermissions.forEach(permKey => {
      const perm = permissions.find(p => p.key === permKey);
      if (!perm?.minTier || perm.minTier >= newTier) {
        newPerms.add(permKey);
      }
    });
    setSelectedPermissions(newPerms);
  };

  const isPermissionAllowed = (perm: Permission): boolean => {
    return !perm.minTier || perm.minTier >= tier;
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
              onPress={() => togglePermission(perm.key)}
              disabled={!allowed}
            >
              <View style={styles.permInfo}>
                <Text style={[styles.permName, !allowed && styles.permNameDisabled]}>
                  {perm.name}
                </Text>
                <Text style={styles.permDesc}>
                  {perm.description}
                  {!allowed && ` (Requires ${TIER_NAMES[(perm.minTier || 0) as RoleTier]})`}
                </Text>
              </View>
              <View
                style={[
                  styles.checkbox,
                  selectedPermissions.has(perm.key) && styles.checkboxChecked,
                  !allowed && styles.checkboxDisabled,
                ]}
              >
                {selectedPermissions.has(perm.key) && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Preview */}
        <View style={styles.preview}>
          <View style={[styles.roleIcon, { backgroundColor: color }]}>
            <Text style={styles.roleIconText}>
              {name ? name.charAt(0).toUpperCase() : 'R'}
            </Text>
          </View>
          <Text style={[styles.previewName, { color }]}>
            {name || 'New Role'}
          </Text>
          <Text style={styles.previewTier}>{TIER_NAMES[tier]}</Text>
        </View>

        {/* Name Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Role Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g., Team Lead, Mentor"
            placeholderTextColor={colors.textMuted}
            maxLength={50}
          />
        </View>

        {/* Tier Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Authority Level</Text>
          <Text style={styles.sectionHint}>
            Determines what this role can manage
          </Text>
          {TIER_OPTIONS.map(option => (
            <TouchableOpacity
              key={option.tier}
              style={[
                styles.tierOption,
                tier === option.tier && styles.tierOptionSelected,
                { borderLeftColor: option.color },
              ]}
              onPress={() => handleTierChange(option.tier)}
            >
              <View style={styles.tierRadio}>
                {tier === option.tier && <View style={styles.tierRadioInner} />}
              </View>
              <View style={styles.tierInfo}>
                <Text style={[styles.tierName, { color: option.color }]}>
                  {option.name}
                </Text>
                <Text style={styles.tierDesc}>{option.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Color Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color</Text>
          <View style={styles.colorPicker}>
            {ROLE_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorOption,
                  { backgroundColor: c },
                  color === c && styles.colorOptionSelected,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {/* Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Settings</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Display separately</Text>
              <Text style={styles.settingDesc}>Show members separately in list</Text>
            </View>
            <Switch
              value={isHoisted}
              onValueChange={setIsHoisted}
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
              value={isMentionable}
              onValueChange={setIsMentionable}
              trackColor={{ false: colors.surface, true: colors.primary }}
              thumbColor={colors.white}
            />
          </View>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions</Text>
          <Text style={styles.sectionHint}>
            Available permissions depend on authority level
          </Text>
          {['Program', 'Channel', 'Member'].map(cat => renderPermissionsByCategory(cat))}
        </View>
      </ScrollView>

      {/* Create Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.createButton, isCreating && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.createButtonText}>Create Role</Text>
          )}
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
  content: {
    paddingBottom: spacing.xxl,
  },
  preview: {
    alignItems: 'center',
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  roleIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  roleIconText: {
    fontSize: 28,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  previewName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
  previewTier: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  section: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  tierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
  },
  tierOptionSelected: {
    backgroundColor: colors.primary + '20',
  },
  tierRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  tierRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  tierDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: colors.white,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingName: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  settingDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  permCategory: {
    marginBottom: spacing.lg,
  },
  permCategoryTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  permItemDisabled: {
    opacity: 0.4,
  },
  permInfo: {
    flex: 1,
  },
  permName: {
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  permNameDisabled: {
    color: colors.textMuted,
  },
  permDesc: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDisabled: {
    borderColor: colors.border,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  createButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
