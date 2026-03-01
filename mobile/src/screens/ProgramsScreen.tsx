/**
 * Programs Screen
 * 2-column grid dashboard of all programs the user is a member of.
 * FAB for add actions, bottom sheet for create/join, Pressable cards with haptics.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import { Program, RootStackParamList } from '../types';
import { programApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  joinProgram,
  leaveProgram,
  subscribeToProgramEvents,
  ProgramUpdatedEventData,
  ProgramDeletedEventData,
} from '../services/socket';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_GAP = spacing.md;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_GAP * 3) / 2;

// ─── Animated card wrapper ────────────────────────────────────
function ProgramCard({
  item,
  onPress,
}: {
  item: Program;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isArchived = item.status === 'ARCHIVED';

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[styles.cardAnimWrapper, { transform: [{ scale }] }]}>
      <Pressable
        style={[styles.card, isArchived && styles.cardArchived]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Icon */}
        <View style={[styles.cardIcon, isArchived && styles.cardIconArchived]}>
          <Text style={styles.cardIconText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Name */}
        <Text
          style={[styles.cardName, isArchived && styles.cardNameArchived]}
          numberOfLines={2}
        >
          {item.name}
        </Text>

        {/* Meta */}
        <Text style={[styles.cardMeta, isArchived && styles.cardMetaArchived]}>
          {isArchived ? 'Archived' : `${item.memberCount} members`}
        </Text>

        {/* Badges */}
        {isArchived && (
          <View style={styles.archivedBadge}>
            <Text style={styles.archivedBadgeText}>Archived</Text>
          </View>
        )}
        {item.isDefault && !isArchived && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>Default</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────
export default function ProgramsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuthStore();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);

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
      setError(err.message || 'Failed to load programs');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [fetchPrograms]);

  // Subscribe to program events for all programs
  useEffect(() => {
    if (programs.length === 0) return;

    const programIds = programs.map(p => p.id);
    programIds.forEach(id => joinProgram(id));

    const unsubscribe = subscribeToProgramEvents({
      onProgramUpdated: (data: ProgramUpdatedEventData) => {
        setPrograms(prev =>
          prev.map(p =>
            p.id === data.programId
              ? {
                  ...p,
                  name: data.name || p.name,
                  description: data.description !== undefined ? data.description : p.description,
                  iconUrl: data.iconUrl !== undefined ? data.iconUrl : p.iconUrl,
                }
              : p,
          ),
        );
      },
      onProgramDeleted: (data: ProgramDeletedEventData) => {
        setPrograms(prev => prev.filter(p => p.id !== data.programId));
      },
    });

    return () => {
      programIds.forEach(id => leaveProgram(id));
      unsubscribe();
    };
  }, [programs.map(p => p.id).join(',')]);

  const handleProgramPress = (program: Program) => {
    navigation.navigate('ProgramDetail', { programId: program.id });
  };

  const handleCreateProgram = () => {
    setShowSheet(false);
    navigation.navigate('CreateProgram');
  };

  const handleJoinProgram = () => {
    setShowSheet(false);
    navigation.navigate('JoinProgram');
  };

  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowSheet(true);
  };

  // ── Render helpers ──────────────────────────────────────

  const renderProgramCard = ({ item }: { item: Program }) => (
    <ProgramCard item={item} onPress={() => handleProgramPress(item)} />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="library-outline" size={48} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No Programs Yet</Text>
      <Text style={styles.emptySubtitle}>
        Create a new program or join one with an invite code
      </Text>
      <View style={styles.emptyButtons}>
        <TouchableOpacity style={styles.emptyCreateBtn} onPress={handleCreateProgram}>
          <Ionicons name="add-circle-outline" size={18} color={colors.white} />
          <Text style={styles.emptyCreateText}>Create</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emptyJoinBtn} onPress={handleJoinProgram}>
          <Ionicons name="link-outline" size={18} color={colors.text} />
          <Text style={styles.emptyJoinText}>Join</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Error state (inline) ─────────────────────────────────
  const renderErrorState = () => (
    <View style={styles.errorState}>
      <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorSubtitle}>{error || 'Failed to load programs'}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={() => fetchPrograms()}>
        <Ionicons name="refresh-outline" size={18} color={colors.white} />
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Loading state ───────────────────────────────────────

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Main render ─────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Programs</Text>
      </View>

      {/* Grid */}
      <FlatList
        data={programs}
        renderItem={renderProgramCard}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={programs.length === 0 ? styles.emptyContainer : styles.gridContent}
        ListEmptyComponent={error ? renderErrorState : renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchPrograms(true)}
            tintColor={colors.primary}
          />
        }
      />

      {/* FAB */}
      {programs.length > 0 && (
        <Pressable style={styles.fab} onPress={handleFabPress}>
          <Ionicons name="add" size={28} color={colors.white} />
        </Pressable>
      )}

      {/* Bottom Sheet */}
      <Modal
        visible={showSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSheet(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowSheet(false)}>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Program</Text>

            <TouchableOpacity style={styles.sheetOption} onPress={handleCreateProgram}>
              <View style={styles.sheetIconCircle}>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionTitle}>Create New Program</Text>
                <Text style={styles.sheetOptionDesc}>Set up a new program from scratch</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetOption} onPress={handleJoinProgram}>
              <View style={styles.sheetIconCircle}>
                <Ionicons name="link-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.sheetOptionText}>
                <Text style={styles.sheetOptionTitle}>Join with Invite Code</Text>
                <Text style={styles.sheetOptionDesc}>Enter a code shared by a facilitator</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancel}
              onPress={() => setShowSheet(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
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

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },

  // Grid
  gridContent: {
    paddingHorizontal: GRID_GAP,
    paddingBottom: spacing.xxxl * 3,
  },
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: GRID_GAP,
  },
  emptyContainer: {
    flex: 1,
  },

  // Card
  cardAnimWrapper: {
    width: CARD_WIDTH,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    minHeight: CARD_WIDTH * 1.15,
    justifyContent: 'center',
    ...shadows.sm,
  },
  cardArchived: {
    opacity: 0.5,
    borderWidth: 1,
    borderColor: colors.warning + '50',
    borderStyle: 'dashed',
  },

  // Card icon
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardIconArchived: {
    backgroundColor: colors.textMuted,
  },
  cardIconText: {
    fontSize: typography.fontSize.xxxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },

  // Card text
  cardName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  cardNameArchived: {
    color: colors.textMuted,
  },
  cardMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cardMetaArchived: {
    fontStyle: 'italic',
  },

  // Status badges on cards
  archivedBadge: {
    backgroundColor: colors.warning + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  archivedBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.warning,
    fontWeight: typography.fontWeight.medium,
  },
  defaultBadge: {
    backgroundColor: colors.accent + '25',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  defaultBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.accent,
    fontWeight: typography.fontWeight.medium,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    minHeight: 44,
  },
  emptyCreateText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  emptyJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    minHeight: 44,
  },
  emptyJoinText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },

  // Error state
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  errorTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorSubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    minHeight: 44,
  },
  retryBtnText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },

  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: borderRadius.xs,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  sheetIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOptionText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  sheetOptionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  sheetOptionDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sheetCancel: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    minHeight: 44,
  },
  sheetCancelText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
  },
});
