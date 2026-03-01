/**
 * JoinRequestList
 * Displays pending join requests with approve/reject actions.
 * Extracted from ProgramSettingsScreen for modularity.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { colors, spacing, typography, borderRadius } from '../../constants/theme';
import { programApi } from '../../services/api';

export interface JoinRequest {
  id: string;
  message: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl: string | null;
  };
}

interface JoinRequestListProps {
  requests: JoinRequest[];
  programId: string;
  onRequestHandled: (requestId: string) => void;
}

export default function JoinRequestList({
  requests,
  programId,
  onRequestHandled,
}: JoinRequestListProps) {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleApproveRequest = async (requestId: string, userName: string) => {
    setIsProcessing(requestId);
    try {
      const response = await programApi.approveJoinRequest(programId, requestId);
      if (response.success) {
        onRequestHandled(requestId);
        Alert.alert('Approved', `${userName} has been added to the program`);
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to approve request');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRejectRequest = async (requestId: string, userName: string) => {
    Alert.alert(
      'Reject Request',
      `Are you sure you want to reject ${userName}'s request to join?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(requestId);
            try {
              const response = await programApi.rejectJoinRequest(programId, requestId);
              if (response.success) {
                onRequestHandled(requestId);
              }
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error?.message || 'Failed to reject request');
            } finally {
              setIsProcessing(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Join Requests</Text>
        {requests.length > 0 && (
          <View style={styles.requestBadge}>
            <Text style={styles.requestBadgeText}>{requests.length}</Text>
          </View>
        )}
      </View>

      {requests.length === 0 ? (
        <View style={styles.emptyRequests}>
          <Text style={styles.emptyRequestsText}>No pending requests</Text>
        </View>
      ) : (
        requests.map(request => (
          <View key={request.id} style={styles.requestCard}>
            <View style={styles.requestInfo}>
              <View style={styles.requestAvatar}>
                <Text style={styles.requestAvatarText}>
                  {request.user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.requestDetails}>
                <Text style={styles.requestName}>{request.user.displayName}</Text>
                <Text style={styles.requestEmail}>{request.user.email}</Text>
                {request.message && (
                  <Text style={styles.requestMessage}>"{request.message}"</Text>
                )}
              </View>
            </View>
            <View style={styles.requestActions}>
              {isProcessing === request.id ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleApproveRequest(request.id, request.user.displayName)}
                  >
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => handleRejectRequest(request.id, request.user.displayName)}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  requestBadge: {
    backgroundColor: colors.error,
    borderRadius: borderRadius.full,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  requestBadgeText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  emptyRequests: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyRequestsText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.md,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestAvatarText: {
    color: colors.white,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  requestDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  requestName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  requestEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  requestMessage: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
  },
  approveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
  },
  approveButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  rejectButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectButtonText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
