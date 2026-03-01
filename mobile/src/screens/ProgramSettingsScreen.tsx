/**
 * Program Settings Screen
 * Thin orchestrator that composes section components for program management.
 * Each section owns its own state, handlers, and styles.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList } from '../types';
import { programApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ProgramInfoSection from '../components/programSettings/ProgramInfoSection';
import InviteCodeSection from '../components/programSettings/InviteCodeSection';
import DangerZoneSection from '../components/programSettings/DangerZoneSection';
import JoinRequestList, { JoinRequest } from '../components/programSettings/JoinRequestList';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ProgramSettings'>;

interface ProgramSettings {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  inviteCode: string;
  isPrivate: boolean;
  status: string;
  ownerId: string;
}

export default function ProgramSettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, programName } = route.params;
  const { user } = useAuthStore();

  const [program, setProgram] = useState<ProgramSettings | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showRefresh = false) => {
    try {
      setError(null);
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // Fetch program details
      const programResponse = await programApi.getProgram(programId);
      if (programResponse.success) {
        const p = programResponse.data.program;
        setProgram({
          id: p.id,
          name: p.name,
          description: p.description,
          iconUrl: p.iconUrl,
          inviteCode: p.inviteCode,
          isPrivate: p.isPrivate || false,
          status: p.status,
          ownerId: p.owner?.id || '',
        });
      }

      // Fetch join requests (will fail if not admin, that's okay)
      try {
        const requestsResponse = await programApi.getJoinRequests(programId);
        if (requestsResponse.success) {
          setJoinRequests(requestsResponse.data.requests);
        }
      } catch {
        // User might not have permission to view join requests
        setJoinRequests([]);
      }
    } catch (err: any) {
      const message = 'Failed to load program settings';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isOwner = program?.ownerId === user?.id;
  const canManage = !!(isOwner || user?.isSuperAdmin);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchData(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Program Info (view / edit) */}
        <ProgramInfoSection
          program={program}
          canManage={canManage}
          programId={programId}
          onProgramUpdated={(updates) =>
            setProgram(prev => prev ? { ...prev, ...updates } : null)
          }
        />

        {/* Channel Management link */}
        {canManage && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Channels & Categories</Text>
            <TouchableOpacity
              style={styles.managementCard}
              onPress={() => navigation.navigate('ChannelManagement', {
                programId,
                programName: program?.name || '',
              })}
            >
              <View style={styles.managementInfo}>
                <View style={styles.managementIcon}>
                  <Ionicons name="tv-outline" size={24} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.managementTitle}>Manage Channels</Text>
                  <Text style={styles.managementDescription}>
                    Create, edit, and organize channels and categories
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Invite Code */}
        <InviteCodeSection
          inviteCode={program?.inviteCode || ''}
          programName={program?.name || ''}
          isPrivate={program?.isPrivate || false}
          canManage={canManage}
          programId={programId}
          onCodeRegenerated={(newCode) =>
            setProgram(prev => prev ? { ...prev, inviteCode: newCode } : null)
          }
        />

        {/* Join Requests (private programs only) */}
        {program?.isPrivate && canManage && (
          <JoinRequestList
            requests={joinRequests}
            programId={programId}
            onRequestHandled={(requestId) =>
              setJoinRequests(prev => prev.filter(r => r.id !== requestId))
            }
          />
        )}

        {/* Archived Banner + Danger Zone */}
        <DangerZoneSection
          programId={programId}
          isArchived={program?.status === 'ARCHIVED'}
          isOwner={isOwner}
          canManage={canManage}
          onStatusChanged={(status) =>
            setProgram(prev => prev ? { ...prev, status } : null)
          }
          onDeleted={() => navigation.navigate('Main')}
        />
      </ScrollView>
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
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  // Channel management link card
  managementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  managementInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  managementIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  managementTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  managementDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
});
