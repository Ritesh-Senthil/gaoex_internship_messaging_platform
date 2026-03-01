/**
 * InviteCodeSection
 * Displays the program invite code with share and regenerate actions.
 * Extracted from ProgramSettingsScreen for modularity.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';

import { colors, spacing, typography, borderRadius } from '../../constants/theme';
import { programApi } from '../../services/api';

interface InviteCodeSectionProps {
  inviteCode: string;
  programName: string;
  isPrivate: boolean;
  canManage: boolean;
  programId: string;
  onCodeRegenerated: (newCode: string) => void;
}

export default function InviteCodeSection({
  inviteCode,
  programName,
  isPrivate,
  canManage,
  programId,
  onCodeRegenerated,
}: InviteCodeSectionProps) {

  const handleShareInviteCode = async () => {
    try {
      const message = isPrivate
        ? `Join "${programName}" using invite code: ${inviteCode}\n\nNote: This is a private program. Your request will need to be approved.`
        : `Join "${programName}" using invite code: ${inviteCode}`;

      await Share.share({
        message,
        title: `Join ${programName}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleRegenerateCode = () => {
    Alert.alert(
      'Regenerate Invite Code',
      'This will invalidate the current invite code. Anyone with the old code will not be able to join. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await programApi.regenerateInviteCode(programId);
              if (response.success) {
                onCodeRegenerated(response.data.inviteCode);
                Alert.alert('Success', 'Invite code regenerated');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to regenerate invite code');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Invite Code</Text>
      <View style={styles.inviteCard}>
        <View style={styles.inviteCodeBox}>
          <Text style={styles.inviteCode}>{inviteCode}</Text>
        </View>
        <Text style={styles.inviteHint}>
          {isPrivate
            ? 'Share this code to let others request to join'
            : 'Share this code to let others join instantly'}
        </Text>
        <View style={styles.inviteButtons}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={handleShareInviteCode}
          >
            <Text style={styles.shareButtonText}>Share Code</Text>
          </TouchableOpacity>
          {canManage && (
            <TouchableOpacity
              style={styles.regenerateButton}
              onPress={handleRegenerateCode}
            >
              <Text style={styles.regenerateButtonText}>Regenerate</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  inviteCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  inviteCodeBox: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  inviteCode: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    letterSpacing: 3,
  },
  inviteHint: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  inviteButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  shareButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  shareButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  regenerateButton: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regenerateButtonText: {
    color: colors.text,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
