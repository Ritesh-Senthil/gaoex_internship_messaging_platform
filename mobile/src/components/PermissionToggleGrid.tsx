/**
 * PermissionToggleGrid
 * Shared collapsible permission grid used by RoleDetailScreen and CreateRoleScreen.
 * Groups permissions into collapsible categories with count badges and chevrons.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { Permission, RoleTier, TIER_NAMES } from '../types';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CATEGORIES: Permission['category'][] = ['Program', 'Channel'];

interface PermissionToggleGridProps {
  /** All available permissions (fetched from API) */
  permissions: Permission[];
  /** Currently selected permission keys */
  selectedPermissions: Set<string>;
  /** Called when a permission toggle is tapped */
  onToggle: (permKey: string) => void;
  /** Whether a permission is allowed at the current tier */
  isPermissionAllowed: (perm: Permission) => boolean;
  /** When true, all toggles are non-interactive (view-only mode) */
  disabled?: boolean;
  /** When true, shows "(Requires <tier>)" for locked permissions */
  showTierRequirement?: boolean;
}

export default function PermissionToggleGrid({
  permissions,
  selectedPermissions,
  onToggle,
  isPermissionAllowed,
  disabled = false,
  showTierRequirement = false,
}: PermissionToggleGridProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (category: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <View>
      {CATEGORIES.map(category => {
        const categoryPerms = permissions.filter(p => p.category === category);
        if (categoryPerms.length === 0) return null;

        const selectedCount = categoryPerms.filter(p => selectedPermissions.has(p.key)).length;
        const isCollapsed = !!collapsed[category];

        return (
          <View key={category} style={styles.category}>
            {/* ── Category Header (tappable to collapse/expand) ── */}
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => toggleCategory(category)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.categoryTitle}>{category}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>
                  {selectedCount}/{categoryPerms.length}
                </Text>
              </View>
            </TouchableOpacity>

            {/* ── Permission Rows (hidden when collapsed) ── */}
            {!isCollapsed && categoryPerms.map(perm => {
              const allowed = isPermissionAllowed(perm);
              const isSelected = selectedPermissions.has(perm.key);
              const isDisabled = disabled || !allowed;

              return (
                <TouchableOpacity
                  key={perm.key}
                  style={[styles.permItem, !allowed && styles.permItemDisabled]}
                  onPress={() => onToggle(perm.key)}
                  disabled={isDisabled}
                  activeOpacity={0.7}
                >
                  <View style={styles.permInfo}>
                    <Text style={[styles.permName, !allowed && styles.permNameDisabled]}>
                      {perm.name}
                    </Text>
                    <Text style={styles.permDesc}>
                      {perm.description}
                      {showTierRequirement && !allowed && perm.minTier != null &&
                        ` (Requires ${TIER_NAMES[perm.minTier as RoleTier]})`
                      }
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                      isDisabled && styles.checkboxDisabled,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  category: {
    marginBottom: spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  categoryTitle: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
  },
  countBadge: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
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
    opacity: 0.5,
  },
  checkmark: {
    color: colors.white,
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
  },
});
