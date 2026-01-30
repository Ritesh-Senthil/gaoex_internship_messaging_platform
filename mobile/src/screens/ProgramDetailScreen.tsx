/**
 * Program Detail Screen
 * Shows categories and channels for a program
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, ProgramDetail, Channel, Category } from '../types';
import { programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'ProgramDetail'>;

export default function ProgramDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId } = route.params;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchProgram = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await programApi.getProgram(programId);

      if (response.success) {
        setProgram(response.data.program);
        // Expand all categories by default
        const categoryIds = new Set(
          response.data.program.categories.map(c => c.id)
        );
        setExpandedCategories(categoryIds);
      } else {
        setError('Failed to load program');
      }
    } catch (err: any) {
      console.error('Failed to fetch program:', err);
      setError(err.message || 'Failed to load program');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [programId]);

  useEffect(() => {
    fetchProgram();
  }, [fetchProgram]);

  useEffect(() => {
    if (program) {
      navigation.setOptions({ title: program.name });
    }
  }, [program, navigation]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const handleChannelPress = (channel: Channel) => {
    navigation.navigate('Channel', {
      channelId: channel.id,
      channelName: channel.name,
    });
  };

  const handleInvitePress = () => {
    if (program) {
      Alert.alert(
        'Invite Code',
        `Share this code to invite others:\n\n${program.inviteCode}`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderChannel = (channel: Channel) => (
    <TouchableOpacity
      key={channel.id}
      style={styles.channelItem}
      onPress={() => handleChannelPress(channel)}
      activeOpacity={0.7}
    >
      <Text style={styles.channelIcon}>
        {channel.type === 'ANNOUNCEMENT' ? '📢' : '#'}
      </Text>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName}>{channel.name}</Text>
        {channel.topic && (
          <Text style={styles.channelTopic} numberOfLines={1}>
            {channel.topic}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderCategory = (category: Category) => {
    const isExpanded = expandedCategories.has(category.id);

    return (
      <View key={category.id} style={styles.categoryContainer}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => toggleCategory(category.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.categoryArrow}>{isExpanded ? '▼' : '▶'}</Text>
          <Text style={styles.categoryName}>{category.name}</Text>
          <Text style={styles.categoryCount}>{category.channels.length}</Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.channelList}>
            {category.channels.map(renderChannel)}
          </View>
        )}
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

  if (error || !program) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>😕</Text>
        <Text style={styles.errorText}>{error || 'Program not found'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchProgram()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchProgram(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* Program Header */}
        <View style={styles.header}>
          <View style={styles.programIcon}>
            <Text style={styles.programIconText}>
              {program.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.programInfo}>
            <Text style={styles.programName}>{program.name}</Text>
            <Text style={styles.programMeta}>
              {program._count.memberships} members
            </Text>
          </View>
          <TouchableOpacity style={styles.inviteButton} onPress={handleInvitePress}>
            <Text style={styles.inviteButtonText}>Invite</Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        {program.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.description}>{program.description}</Text>
          </View>
        )}

        {/* Categories and Channels */}
        <View style={styles.channelsSection}>
          <Text style={styles.sectionTitle}>Channels</Text>

          {/* Uncategorized channels first */}
          {program.channels.length > 0 && (
            <View style={styles.uncategorizedChannels}>
              {program.channels.map(renderChannel)}
            </View>
          )}

          {/* Categories */}
          {program.categories.map(renderCategory)}

          {/* Empty state */}
          {program.categories.length === 0 && program.channels.length === 0 && (
            <View style={styles.emptyChannels}>
              <Text style={styles.emptyText}>No channels yet</Text>
            </View>
          )}
        </View>
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
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  retryButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  programIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  programIconText: {
    fontSize: 24,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  programInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  programName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  programMeta: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  inviteButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  inviteButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  descriptionContainer: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  description: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  channelsSection: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  uncategorizedChannels: {
    marginBottom: spacing.md,
  },
  categoryContainer: {
    marginBottom: spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  categoryArrow: {
    fontSize: 10,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  categoryName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  categoryCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  channelList: {
    marginLeft: spacing.md,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  channelIcon: {
    fontSize: 18,
    color: colors.channelText,
    width: 24,
  },
  channelInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  channelName: {
    fontSize: typography.fontSize.md,
    color: colors.channelTextHover,
  },
  channelTopic: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyChannels: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
});
