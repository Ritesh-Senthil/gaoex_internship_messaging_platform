/**
 * DangerZoneSection
 * Handles program lifecycle actions: archive, restore, and delete.
 * Also renders the archived banner when the program is archived.
 * Extracted from ProgramSettingsScreen for modularity.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, borderRadius } from '../../constants/theme';
import { programApi } from '../../services/api';

interface DangerZoneSectionProps {
  programId: string;
  isArchived: boolean;
  isOwner: boolean;
  canManage: boolean;
  onStatusChanged: (status: string) => void;
  onDeleted: () => void;
}

export default function DangerZoneSection({
  programId,
  isArchived,
  isOwner,
  canManage,
  onStatusChanged,
  onDeleted,
}: DangerZoneSectionProps) {

  const handleArchiveProgram = () => {
    Alert.alert(
      'Archive Program',
      'Archiving will hide this program from members. You can restore it later. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await programApi.archiveProgram(programId);
              if (response.success) {
                onStatusChanged('ARCHIVED');
                Alert.alert('Archived', 'Program has been archived');
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error?.message || 'Failed to archive program');
            }
          },
        },
      ]
    );
  };

  const handleRestoreProgram = async () => {
    try {
      const response = await programApi.restoreProgram(programId);
      if (response.success) {
        onStatusChanged('ACTIVE');
        Alert.alert('Restored', 'Program has been restored and is now visible to members');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to restore program');
    }
  };

  const handleDeleteProgram = () => {
    Alert.alert(
      'Delete Program',
      'This action cannot be undone. All channels, messages, and data will be permanently deleted. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await programApi.deleteProgram(programId);
              if (response.success) {
                Alert.alert('Deleted', 'Program has been deleted', [
                  { text: 'OK', onPress: onDeleted },
                ]);
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error?.message || 'Failed to delete program');
            }
          },
        },
      ]
    );
  };

  return (
    <>
      {/* Archived Banner */}
      {isArchived && (
        <View style={styles.archivedBanner}>
          <View style={styles.archivedBannerIcon}>
            <Ionicons name="archive-outline" size={20} color={colors.warning} />
          </View>
          <View style={styles.archivedBannerContent}>
            <Text style={styles.archivedBannerTitle}>This program is archived</Text>
            <Text style={styles.archivedBannerText}>
              Members cannot see this program. Restore it to make it visible again.
            </Text>
          </View>
          <TouchableOpacity style={styles.restoreButton} onPress={handleRestoreProgram}>
            <Text style={styles.restoreButtonText}>Restore</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Danger Zone Card */}
      {canManage && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <View style={styles.dangerCard}>
            {!isArchived ? (
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleArchiveProgram}
              >
                <Text style={styles.dangerButtonText}>Archive Program</Text>
                <Text style={styles.dangerDescription}>
                  Hide this program from all members
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.dangerButton}
                onPress={handleRestoreProgram}
              >
                <Text style={styles.restoreActionText}>Restore Program</Text>
                <Text style={styles.dangerDescription}>
                  Make this program visible to members again
                </Text>
              </TouchableOpacity>
            )}

            {isOwner && (
              <TouchableOpacity
                style={[styles.dangerButton, styles.deleteButton]}
                onPress={handleDeleteProgram}
              >
                <Text style={styles.deleteButtonText}>Delete Program</Text>
                <Text style={styles.dangerDescription}>
                  Permanently delete all data
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </>
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
  dangerTitle: {
    color: colors.error,
  },
  dangerCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error + '30',
    overflow: 'hidden',
  },
  dangerButton: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  deleteButton: {
    borderBottomWidth: 0,
  },
  dangerButtonText: {
    color: colors.warning,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  dangerDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    marginTop: spacing.xs,
  },
  restoreActionText: {
    color: colors.success,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  archivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '20',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.warning + '50',
  },
  archivedBannerIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  archivedBannerContent: {
    flex: 1,
  },
  archivedBannerTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  archivedBannerText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  restoreButton: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  restoreButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
