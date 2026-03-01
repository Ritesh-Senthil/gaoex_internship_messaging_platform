/**
 * ProgramInfoSection
 * Displays program information in view mode, with an inline edit form
 * that allows admins to change name, description, and privacy.
 * Extracted from ProgramSettingsScreen for modularity.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';

import { colors, spacing, typography, borderRadius } from '../../constants/theme';
import { programApi } from '../../services/api';

interface ProgramInfoData {
  name: string;
  description: string | null;
  isPrivate: boolean;
}

interface ProgramInfoSectionProps {
  program: ProgramInfoData | null;
  canManage: boolean;
  programId: string;
  onProgramUpdated: (updates: { name: string; description: string | null; isPrivate: boolean }) => void;
}

export default function ProgramInfoSection({
  program,
  canManage,
  programId,
  onProgramUpdated,
}: ProgramInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(program?.name || '');
  const [editDescription, setEditDescription] = useState(program?.description || '');
  const [editIsPrivate, setEditIsPrivate] = useState(program?.isPrivate || false);

  // Sync edit fields when program data changes (e.g., after pull-to-refresh).
  // This preserves the original behaviour where fetchData() resets edit fields.
  useEffect(() => {
    if (program) {
      setEditName(program.name);
      setEditDescription(program.description || '');
      setEditIsPrivate(program.isPrivate);
    }
  }, [program?.name, program?.description, program?.isPrivate]);

  const handleCancel = () => {
    setEditName(program?.name || '');
    setEditDescription(program?.description || '');
    setEditIsPrivate(program?.isPrivate || false);
    setIsEditing(false);
  };

  const handleSaveChanges = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Program name is required');
      return;
    }

    try {
      const response = await programApi.updateProgram(programId, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        isPrivate: editIsPrivate,
      });

      if (response.success) {
        onProgramUpdated({
          name: editName.trim(),
          description: editDescription.trim() || null,
          isPrivate: editIsPrivate,
        });
        setIsEditing(false);
        Alert.alert('Success', 'Program settings updated');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to update program');
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Program Information</Text>

      {isEditing ? (
        <View style={styles.editForm}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="Program name"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={editDescription}
            onChangeText={setEditDescription}
            placeholder="Program description (optional)"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Private Program</Text>
              <Text style={styles.switchDescription}>
                Require approval to join
              </Text>
            </View>
            <Switch
              value={editIsPrivate}
              onValueChange={setEditIsPrivate}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <View style={styles.editButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveChanges}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{program?.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Description</Text>
            <Text style={styles.infoValue}>
              {program?.description || 'No description'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Privacy</Text>
            <View style={[
              styles.privacyBadge,
              program?.isPrivate ? styles.privateBadge : styles.publicBadge
            ]}>
              <Text style={[
                styles.privacyBadgeText,
                program?.isPrivate ? styles.privateBadgeText : styles.publicBadgeText
              ]}>
                {program?.isPrivate ? 'Private' : 'Public'}
              </Text>
            </View>
          </View>

          {canManage && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editButtonText}>Edit Information</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    width: 100,
  },
  infoValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  privacyBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  publicBadge: {
    backgroundColor: colors.success + '20',
  },
  privateBadge: {
    backgroundColor: colors.warning + '20',
  },
  privacyBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  publicBadgeText: {
    color: colors.success,
  },
  privateBadgeText: {
    color: colors.warning,
  },
  editButton: {
    marginTop: spacing.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  editButtonText: {
    color: colors.primary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  editForm: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  switchLabel: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  switchDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  editButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  saveButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
