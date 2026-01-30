/**
 * Programs Screen
 * Lists all programs the user is a member of
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { Program, RootStackParamList } from '../types';
import { programApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProgramsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuthStore();
  
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrograms = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await programApi.getPrograms();
      
      if (response.success) {
        setPrograms(response.data.programs);
      } else {
        setError('Failed to load programs');
      }
    } catch (err: any) {
      console.error('Failed to fetch programs:', err);
      setError(err.message || 'Failed to load programs');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  const handleProgramPress = (program: Program) => {
    navigation.navigate('ProgramDetail', { programId: program.id });
  };

  const handleJoinProgram = () => {
    navigation.navigate('JoinProgram');
  };

  const renderProgramItem = ({ item }: { item: Program }) => (
    <TouchableOpacity
      style={styles.programItem}
      onPress={() => handleProgramPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.programIcon}>
        {item.iconUrl ? (
          <Text style={styles.programIconText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        ) : (
          <Text style={styles.programIconText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      
      <View style={styles.programInfo}>
        <View style={styles.programHeader}>
          <Text style={styles.programName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
        </View>
        
        <Text style={styles.programMeta}>
          {item.memberCount} members • {item.channelCount} channels
        </Text>
        
        {item.roles.length > 0 && (
          <View style={styles.rolesContainer}>
            {item.roles.slice(0, 3).map((role) => (
              <View
                key={role.id}
                style={[styles.roleBadge, { backgroundColor: role.color + '30' }]}
              >
                <View style={[styles.roleColor, { backgroundColor: role.color }]} />
                <Text style={[styles.roleText, { color: role.color }]}>
                  {role.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>📚</Text>
      <Text style={styles.emptyTitle}>No Programs Yet</Text>
      <Text style={styles.emptySubtitle}>
        Join a program using an invite code to get started
      </Text>
      <TouchableOpacity style={styles.joinButton} onPress={handleJoinProgram}>
        <Text style={styles.joinButtonText}>Join a Program</Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Programs</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleJoinProgram}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Programs List */}
      <FlatList
        data={programs}
        renderItem={renderProgramItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={programs.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchPrograms(true)}
            tintColor={colors.primary}
          />
        }
      />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
    marginTop: -2,
  },
  listContent: {
    padding: spacing.md,
  },
  emptyContainer: {
    flex: 1,
  },
  programItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  programIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  programIconText: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  programInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  programName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    flex: 1,
  },
  defaultBadge: {
    backgroundColor: colors.accent + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  defaultBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.medium,
  },
  programMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  roleColor: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
  },
  roleText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  joinButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  joinButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
});
