/**
 * New Conversation Screen
 * Multi-select user search to start a 1:1 DM or group DM.
 *
 * Flow:
 * - Search users by name/email
 * - Tap a result to add them to the "selected" chip bar
 * - Tap a chip to deselect
 * - When 1 user selected  → "Start Conversation" button (creates 1:1)
 * - When 2+ users selected → optional group name input + "Create Group" button
 * - Max 7 others (8 total including self)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import UserAvatar from '../components/UserAvatar';
import { RootStackParamList } from '../types';
import { userApi, conversationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { debounce } from '../utils/debounce';

// ── Constants ──

const MAX_OTHER_PARTICIPANTS = 7; // 7 others + self = 8 total
const MAX_GROUP_NAME_LENGTH = 100;
const SEARCH_DEBOUNCE_MS = 300;

// ── Types ──

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SearchUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

// ── Component ──

export default function NewConversationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuthStore();
  const searchInputRef = useRef<TextInput>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection state
  const [selectedUsers, setSelectedUsers] = useState<SearchUser[]>([]);
  const selectedIdsSet = new Set(selectedUsers.map(u => u.id));

  // Group name state (only shown when 2+ selected)
  const [groupName, setGroupName] = useState('');

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  const isGroupMode = selectedUsers.length >= 2;
  const canCreate = selectedUsers.length >= 1;
  const isMaxReached = selectedUsers.length >= MAX_OTHER_PARTICIPANTS;

  // ── Search logic ──

  const searchUsers = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      setSearchError(null);

      try {
        const response = await userApi.searchUsers(query);
        if (response.success) {
          // Filter out current user
          const filtered = response.data.users.filter(
            (u: SearchUser) => u.id !== user?.id
          );
          setSearchResults(filtered);
        }
      } catch (err: any) {
        setSearchError('Failed to search users');
      } finally {
        setIsSearching(false);
      }
    },
    [user]
  );

  const debouncedSearch = useCallback(
    debounce((query: string) => searchUsers(query), SEARCH_DEBOUNCE_MS),
    [searchUsers]
  );

  useEffect(() => {
    debouncedSearch(searchQuery);
    return () => debouncedSearch.cancel();
  }, [searchQuery, debouncedSearch]);

  // ── Selection logic ──

  const toggleUser = useCallback(
    (u: SearchUser) => {
      setSelectedUsers(prev => {
        const alreadySelected = prev.some(s => s.id === u.id);
        if (alreadySelected) {
          return prev.filter(s => s.id !== u.id);
        }
        if (prev.length >= MAX_OTHER_PARTICIPANTS) {
          Alert.alert(
            'Limit Reached',
            `Group conversations can have at most ${MAX_OTHER_PARTICIPANTS + 1} participants (including you).`
          );
          return prev;
        }
        return [...prev, u];
      });
    },
    []
  );

  const removeUser = useCallback((userId: string) => {
    setSelectedUsers(prev => prev.filter(s => s.id !== userId));
  }, []);

  // ── Create conversation ──

  const handleCreate = useCallback(async () => {
    if (selectedUsers.length === 0 || isCreating) return;

    // Validate group name length
    if (isGroupMode && groupName.trim().length > MAX_GROUP_NAME_LENGTH) {
      Alert.alert('Name Too Long', `Group name cannot exceed ${MAX_GROUP_NAME_LENGTH} characters.`);
      return;
    }

    setIsCreating(true);
    Keyboard.dismiss();

    try {
      const participantIds = selectedUsers.map(u => u.id);
      const name = isGroupMode && groupName.trim() ? groupName.trim() : undefined;

      const response = await conversationApi.createConversation(participantIds, name);

      if (response.success) {
        const { conversation } = response.data;

        // Navigate to the conversation
        navigation.replace('Conversation', {
          conversationId: conversation.id,
          name: conversation.name,
        });
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        'Failed to create conversation. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsCreating(false);
    }
  }, [selectedUsers, isGroupMode, groupName, isCreating, navigation]);

  // ── Renders ──

  const renderSelectedChip = (u: SearchUser) => (
    <TouchableOpacity
      key={u.id}
      style={styles.chip}
      onPress={() => removeUser(u.id)}
      activeOpacity={0.7}
    >
      <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size={22} />
      <Text style={styles.chipName} numberOfLines={1}>
        {u.displayName}
      </Text>
      <Ionicons name="close-circle" size={14} color={colors.textMuted} />
    </TouchableOpacity>
  );

  const renderSearchResult = ({ item }: { item: SearchUser }) => {
    const isSelected = selectedIdsSet.has(item.id);
    const isDisabled = !isSelected && isMaxReached;

    return (
      <TouchableOpacity
        style={[styles.userItem, isDisabled && styles.userItemDisabled]}
        onPress={() => toggleUser(item)}
        activeOpacity={0.7}
        disabled={isDisabled || isCreating}
      >
        <UserAvatar
          name={item.displayName}
          avatarUrl={item.avatarUrl}
          size={44}
          style={{ marginRight: spacing.md }}
        />

        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.displayName}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>

        {/* Selection indicator */}
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Layout ──

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Creating overlay */}
      {isCreating && (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.creatingText}>
            {isGroupMode ? 'Creating group...' : 'Starting conversation...'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Selected users chip bar */}
        {selectedUsers.length > 0 && (
          <View style={styles.chipsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContent}
              keyboardShouldPersistTaps="handled"
            >
              {selectedUsers.map(renderSelectedChip)}
            </ScrollView>
            <Text style={styles.chipCount}>
              {selectedUsers.length}/{MAX_OTHER_PARTICIPANTS}
            </Text>
          </View>
        )}

        {/* Group name input (shown when 2+ selected = group mode) */}
        {isGroupMode && (
          <View style={styles.groupNameContainer}>
            <TextInput
              style={styles.groupNameInput}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name (optional)"
              placeholderTextColor={colors.textMuted}
              maxLength={MAX_GROUP_NAME_LENGTH}
              returnKeyType="done"
              onSubmitEditing={() => searchInputRef.current?.focus()}
            />
            {groupName.length > 0 && (
              <Text style={styles.groupNameCount}>
                {groupName.length}/{MAX_GROUP_NAME_LENGTH}
              </Text>
            )}
          </View>
        )}

        {/* Search input */}
        <View style={styles.searchContainer}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {isSearching && (
            <ActivityIndicator style={styles.searchSpinner} color={colors.primary} />
          )}
        </View>

        {/* Error */}
        {searchError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{searchError}</Text>
          </View>
        )}

        {/* Search results */}
        <FlatList
          data={searchResults}
          keyExtractor={item => item.id}
          renderItem={renderSearchResult}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searchQuery.trim() ? (
              <View style={styles.emptyContainer}>
                {isSearching ? null : (
                  <>
                    <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                    <Text style={styles.emptyText}>
                      No users found for "{searchQuery}"
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>Search for people</Text>
                <Text style={styles.emptyText}>
                  {selectedUsers.length === 0
                    ? 'Select one person for a DM, or multiple for a group'
                    : isGroupMode
                    ? `Add more people or tap "Create Group" below`
                    : 'Add one more person for a group, or create a 1:1 DM'}
                </Text>
              </View>
            )
          }
        />

        {/* Create / Start button */}
        {canCreate && (
          <View style={styles.createButtonContainer}>
            <TouchableOpacity
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={handleCreate}
              activeOpacity={0.8}
              disabled={isCreating}
            >
              <Text style={styles.createButtonText}>
                {isGroupMode
                  ? `Create Group (${selectedUsers.length + 1})`
                  : 'Start Conversation'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  creatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  creatingText: {
    marginTop: spacing.md,
    color: colors.white,
    fontSize: typography.fontSize.md,
  },

  // ── Chips bar ──
  chipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  chipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: spacing.sm,
    gap: 6,
    maxWidth: 160,
  },
  chipName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    flexShrink: 1,
  },
  chipCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    flexShrink: 0,
  },

  // ── Group name ──
  groupNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  groupNameInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  groupNameCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },

  // ── Search ──
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  searchSpinner: {
    marginLeft: spacing.sm,
  },

  // ── Error ──
  errorContainer: {
    padding: spacing.md,
    backgroundColor: colors.error + '20',
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },

  // ── List ──
  listContent: {
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  userItemDisabled: {
    opacity: 0.4,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },

  // ── Checkbox ──
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },

  // ── Empty state ──
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── Create button ──
  createButtonContainer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
});
