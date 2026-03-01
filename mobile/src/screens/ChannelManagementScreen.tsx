/**
 * Channel Management Screen
 * Admin screen for managing categories and channels.
 * Long-press or tap "..." on any row to open context menu.
 * Bottom action bar for creating new items (thumb-zone).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  RefreshControl,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { RootStackParamList, Category, Channel } from '../types';
import { programApi } from '../services/api';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChannelManagement'>;
type RouteProps = RouteProp<RootStackParamList, 'ChannelManagement'>;

interface CategoryWithChannels extends Category {
  channels: Channel[];
}

// Context menu target
type ContextTarget =
  | { type: 'channel'; item: Channel }
  | { type: 'category'; item: CategoryWithChannels }
  | null;

export default function ChannelManagementScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { programId, programName } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryWithChannels[]>([]);
  const [uncategorizedChannels, setUncategorizedChannels] = useState<Channel[]>([]);

  // Context menu
  const [contextTarget, setContextTarget] = useState<ContextTarget>(null);

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  // Form states
  const [categoryName, setCategoryName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelTopic, setChannelTopic] = useState('');
  const [channelType, setChannelType] = useState<'TEXT' | 'ANNOUNCEMENT'>('TEXT');
  const [channelIsPrivate, setChannelIsPrivate] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────────

  const fetchData = useCallback(async (showFullScreenLoading = true) => {
    try {
      setError(null);
      if (showFullScreenLoading) setLoading(true);
      const response = await programApi.getProgram(programId);
      if (response.success && response.data.program) {
        setCategories(response.data.program.categories || []);
        setUncategorizedChannels(response.data.program.channels || []);
      }
    } catch (err: any) {
      const message = 'Failed to load channel data';
      setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [programId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(false); };

  // ── Context menu ───────────────────────────────────────

  const openContextMenu = (target: ContextTarget) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextTarget(target);
  };

  // ── Category handlers ──────────────────────────────────

  const openCategoryModal = (category?: Category) => {
    setContextTarget(null);
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
    } else {
      setEditingCategory(null);
      setCategoryName('');
    }
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('Error', 'Category name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingCategory) {
        await programApi.updateCategory(programId, editingCategory.id, categoryName.trim());
      } else {
        await programApi.createCategory(programId, categoryName.trim());
      }
      setShowCategoryModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    setContextTarget(null);
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete "${category.name}"? Channels will be moved to uncategorized.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await programApi.deleteCategory(programId, category.id);
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error?.message || 'Failed to delete category');
            }
          },
        },
      ],
    );
  };

  // ── Channel handlers ───────────────────────────────────

  const openChannelModal = (channel?: Channel, categoryId?: string | null) => {
    setContextTarget(null);
    if (channel) {
      setEditingChannel(channel);
      setChannelName(channel.name);
      setChannelTopic(channel.topic || '');
      setChannelType(channel.type);
      setChannelIsPrivate(channel.isPrivate || false);
      setSelectedCategoryId(channel.categoryId);
    } else {
      setEditingChannel(null);
      setChannelName('');
      setChannelTopic('');
      setChannelType('TEXT');
      setChannelIsPrivate(false);
      setSelectedCategoryId(categoryId ?? null);
    }
    setShowChannelModal(true);
  };

  const handleSaveChannel = async () => {
    if (!channelName.trim()) {
      Alert.alert('Error', 'Channel name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingChannel) {
        await programApi.updateChannel(programId, editingChannel.id, {
          name: channelName.trim(),
          topic: channelTopic.trim() || undefined,
          type: channelType,
          isPrivate: channelIsPrivate,
          categoryId: selectedCategoryId,
        });
      } else {
        await programApi.createChannel(programId, {
          name: channelName.trim(),
          topic: channelTopic.trim() || undefined,
          type: channelType,
          isPrivate: channelIsPrivate,
          categoryId: selectedCategoryId,
        });
      }
      setShowChannelModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error?.message || 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = (channel: Channel) => {
    setContextTarget(null);
    if (channel.isProtected) {
      Alert.alert('Protected Channel', 'This channel is protected and cannot be deleted.');
      return;
    }
    Alert.alert(
      'Delete Channel',
      `Are you sure you want to delete #${channel.name}? All messages will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await programApi.deleteChannel(programId, channel.id);
              fetchData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.error?.message || 'Failed to delete channel');
            }
          },
        },
      ],
    );
  };

  const handleChannelPermissions = (channel: Channel) => {
    setContextTarget(null);
    navigation.navigate('ChannelPermissions', {
      programId,
      channelId: channel.id,
      channelName: channel.name,
    });
  };

  // ── Render helpers ─────────────────────────────────────

  const getChannelIconName = (channel: Channel): keyof typeof Ionicons.glyphMap => {
    if (channel.type === 'ANNOUNCEMENT') return 'megaphone-outline';
    return 'chatbubble-outline'; // text channel
  };

  const renderChannel = (channel: Channel) => (
    <TouchableOpacity
      key={channel.id}
      style={styles.channelItem}
      onLongPress={() => openContextMenu({ type: 'channel', item: channel })}
      activeOpacity={0.7}
    >
      <Ionicons name={getChannelIconName(channel)} size={16} color={colors.textSecondary} style={styles.chIcon} />
      <Text style={styles.channelName} numberOfLines={1}>{channel.name}</Text>
      {channel.isPrivate && (
        <Ionicons name="lock-closed" size={12} color={colors.textMuted} style={{ marginLeft: spacing.xs }} />
      )}
      {channel.isProtected && (
        <Ionicons name="shield-checkmark-outline" size={12} color={colors.textMuted} style={{ marginLeft: spacing.xs }} />
      )}
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        style={styles.overflowBtn}
        onPress={() => openContextMenu({ type: 'channel', item: channel })}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderCategory = (category: CategoryWithChannels) => (
    <View key={category.id} style={styles.categorySection}>
      <TouchableOpacity
        style={styles.categoryHeader}
        onLongPress={() => openContextMenu({ type: 'category', item: category })}
        activeOpacity={0.7}
      >
        <Text style={styles.categoryName}>{category.name.toUpperCase()}</Text>
        <View style={styles.categoryRight}>
          <Text style={styles.categoryCount}>{category.channels.length}</Text>
          <TouchableOpacity
            style={styles.catAddBtn}
            onPress={() => openChannelModal(undefined, category.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.overflowBtn}
            onPress={() => openContextMenu({ type: 'category', item: category })}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
      {category.channels.length === 0 ? (
        <Text style={styles.emptyText}>No channels in this category</Text>
      ) : (
        category.channels.map(renderChannel)
      )}
    </View>
  );

  // ── Context Menu Bottom Sheet ──────────────────────────

  const renderContextSheet = () => {
    if (!contextTarget) return null;

    const isChannel = contextTarget.type === 'channel';
    const channel = isChannel ? (contextTarget.item as Channel) : null;
    const category = !isChannel ? (contextTarget.item as CategoryWithChannels) : null;

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setContextTarget(null)}>
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setContextTarget(null)}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {isChannel ? `# ${channel!.name}` : category!.name}
            </Text>

            {/* Channel options */}
            {isChannel && channel && (
              <>
                <TouchableOpacity style={styles.sheetOption} onPress={() => openChannelModal(channel)}>
                  <Ionicons name="create-outline" size={20} color={colors.text} />
                  <Text style={styles.sheetOptionText}>Edit Channel</Text>
                </TouchableOpacity>
                {channel.isPrivate && (
                  <TouchableOpacity style={styles.sheetOption} onPress={() => handleChannelPermissions(channel)}>
                    <Ionicons name="people-outline" size={20} color={colors.text} />
                    <Text style={styles.sheetOptionText}>Manage Access</Text>
                  </TouchableOpacity>
                )}
                {!channel.isProtected && (
                  <TouchableOpacity style={styles.sheetOption} onPress={() => handleDeleteChannel(channel)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                    <Text style={[styles.sheetOptionText, { color: colors.error }]}>Delete Channel</Text>
                  </TouchableOpacity>
                )}
                {channel.isProtected && (
                  <View style={[styles.sheetOption, { opacity: 0.4 }]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} />
                    <Text style={[styles.sheetOptionText, { color: colors.textMuted }]}>Protected (cannot delete)</Text>
                  </View>
                )}
              </>
            )}

            {/* Category options */}
            {!isChannel && category && (
              <>
                <TouchableOpacity style={styles.sheetOption} onPress={() => openCategoryModal(category)}>
                  <Ionicons name="create-outline" size={20} color={colors.text} />
                  <Text style={styles.sheetOptionText}>Edit Category</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.sheetOption} onPress={() => handleDeleteCategory(category)}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                  <Text style={[styles.sheetOptionText, { color: colors.error }]}>Delete Category</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // ── Loading state ──────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchData(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Categories and Channels */}
        {categories.map(renderCategory)}

        {/* Uncategorized Channels */}
        {uncategorizedChannels.length > 0 && (
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <Text style={styles.categoryName}>UNCATEGORIZED</Text>
              <View style={styles.categoryRight}>
                <Text style={styles.categoryCount}>{uncategorizedChannels.length}</Text>
                <TouchableOpacity
                  style={styles.catAddBtn}
                  onPress={() => openChannelModal(undefined, null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {uncategorizedChannels.map(renderChannel)}
          </View>
        )}

        {categories.length === 0 && uncategorizedChannels.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyStateText}>No channels yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Create a category and add some channels to get started
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Bottom Action Bar (thumb zone) ──────────── */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.bottomBtnSecondary} onPress={() => openCategoryModal()}>
          <Ionicons name="folder-outline" size={18} color={colors.text} />
          <Text style={styles.bottomBtnSecondaryText}>New Category</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBtnPrimary} onPress={() => openChannelModal()}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.bottomBtnPrimaryText}>New Channel</Text>
        </TouchableOpacity>
      </View>

      {/* ── Context Menu Bottom Sheet ───────────────── */}
      {renderContextSheet()}

      {/* ── Category Modal ──────────────────────────── */}
      <Modal visible={showCategoryModal} animationType="slide" transparent onRequestClose={() => setShowCategoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor={colors.textMuted}
              value={categoryName}
              onChangeText={setCategoryName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCategoryModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSaveCategory}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Channel Modal ───────────────────────────── */}
      <Modal visible={showChannelModal} animationType="slide" transparent onRequestClose={() => setShowChannelModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView style={{ maxHeight: '80%' }}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingChannel ? 'Edit Channel' : 'New Channel'}
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Channel name (e.g. general)"
                placeholderTextColor={colors.textMuted}
                value={channelName}
                onChangeText={setChannelName}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.topicInput]}
                placeholder="Topic (optional)"
                placeholderTextColor={colors.textMuted}
                value={channelTopic}
                onChangeText={setChannelTopic}
                multiline
              />

              {/* Channel Type */}
              <View style={styles.optionSection}>
                <Text style={styles.optionLabel}>Channel Type</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[styles.typeOption, channelType === 'TEXT' && styles.typeOptionSelected]}
                    onPress={() => setChannelType('TEXT')}
                  >
                    <Text style={[styles.typeIconHash, channelType === 'TEXT' && styles.typeIconHashSelected]}>#</Text>
                    <Text style={[styles.typeText, channelType === 'TEXT' && styles.typeTextSelected]}>Text</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeOption, channelType === 'ANNOUNCEMENT' && styles.typeOptionSelected]}
                    onPress={() => setChannelType('ANNOUNCEMENT')}
                  >
                    <Ionicons name="megaphone-outline" size={16} color={channelType === 'ANNOUNCEMENT' ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.typeText, channelType === 'ANNOUNCEMENT' && styles.typeTextSelected]}>Announce</Text>
                  </TouchableOpacity>
                </View>
                {channelType === 'ANNOUNCEMENT' && (
                  <Text style={styles.typeHint}>Only admins can post in announcement channels</Text>
                )}
              </View>

              {/* Category Selection */}
              <View style={styles.optionSection}>
                <Text style={styles.optionLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    style={[styles.categoryOption, selectedCategoryId === null && styles.categoryOptionSelected]}
                    onPress={() => setSelectedCategoryId(null)}
                  >
                    <Text style={[styles.categoryOptionText, selectedCategoryId === null && styles.categoryOptionTextSelected]}>None</Text>
                  </TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryOption, selectedCategoryId === cat.id && styles.categoryOptionSelected]}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text style={[styles.categoryOptionText, selectedCategoryId === cat.id && styles.categoryOptionTextSelected]}>{cat.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Private Toggle */}
              <View style={styles.switchRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
                  <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
                  <View>
                    <Text style={styles.switchLabel}>Private Channel</Text>
                    <Text style={styles.switchHint}>Only specific roles/members can access</Text>
                  </View>
                </View>
                <Switch
                  value={channelIsPrivate}
                  onValueChange={setChannelIsPrivate}
                  trackColor={{ false: colors.surfaceLight, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setShowChannelModal(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.disabledButton]}
                  onPress={handleSaveChannel}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 100 },

  // Category section
  categorySection: {
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
  },
  categoryName: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
    flex: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  catAddBtn: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Channel row
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    minHeight: 44,
  },
  chIcon: { marginRight: spacing.sm },
  channelName: {
    color: colors.text,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  overflowBtn: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty states
  emptyText: {
    color: colors.textMuted,
    fontSize: typography.fontSize.sm,
    padding: spacing.md,
    fontStyle: 'italic',
  },
  emptyState: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyStateText: {
    color: colors.text,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
  },
  emptyStateSubtext: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.md,
    textAlign: 'center',
  },

  // Bottom action bar
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  bottomBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  bottomBtnSecondaryText: {
    color: colors.text,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  bottomBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  bottomBtnPrimaryText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },

  // Context menu bottom sheet
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
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  sheetOptionText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.fontSize.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicInput: { minHeight: 80, textAlignVertical: 'top' },

  optionSection: { marginBottom: spacing.md },
  optionLabel: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  typeSelector: { flexDirection: 'row', gap: spacing.sm },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  typeIconHash: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
  },
  typeIconHashSelected: { color: colors.primary },
  typeText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  typeTextSelected: { color: colors.primary },
  typeHint: {
    color: colors.textMuted,
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },

  categoryOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '20',
  },
  categoryOptionText: { color: colors.textSecondary, fontSize: typography.fontSize.sm },
  categoryOptionTextSelected: { color: colors.primary, fontWeight: typography.fontWeight.semibold },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    color: colors.text,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
  },
  switchHint: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  cancelButtonText: { color: colors.textSecondary, fontSize: typography.fontSize.md },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  disabledButton: { opacity: 0.6 },
  saveButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
});
