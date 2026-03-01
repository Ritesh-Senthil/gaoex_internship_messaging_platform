/**
 * AddMembersModal
 * Full-sheet modal for searching and adding members to a group conversation.
 * Owns all search/add state internally; parent controls visibility.
 * Extracted from GroupInfoScreen for modularity.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { ConversationParticipant } from '../types';
import { conversationApi, userApi } from '../services/api';
import UserAvatar from './UserAvatar';
import { debounce } from '../utils/debounce';

export const MAX_TOTAL_PARTICIPANTS = 8;
const SEARCH_DEBOUNCE_MS = 300;

interface SearchUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

interface AddMembersModalProps {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  participants: ConversationParticipant[];
  currentUserId: string;
  onMemberAdded: () => Promise<void>;
}

export default function AddMembersModal({
  visible,
  onClose,
  conversationId,
  participants,
  currentUserId,
  onMemberAdded,
}: AddMembersModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const searchInputRef = useRef<TextInput>(null);

  const canAddMembers = participants.length < MAX_TOTAL_PARTICIPANTS;

  // ── Search users ──
  const debouncedSearch = useCallback(
    debounce(async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const response = await userApi.searchUsers(query.trim());
        if (response.success) {
          // Filter out users already in the group and self
          const existingIds = new Set(participants.map(p => p.userId));
          existingIds.add(currentUserId);
          const filtered = response.data.users.filter((u: SearchUser) => !existingIds.has(u.id));
          setSearchResults(filtered);
        }
      } catch (err: any) {
        // silently ignore
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS),
    [participants, currentUserId],
  );

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    debouncedSearch(text);
  };

  const handleAddMember = async (userId: string) => {
    if (isAdding) return;
    if (participants.length >= MAX_TOTAL_PARTICIPANTS) {
      Alert.alert('Limit reached', `A group can have at most ${MAX_TOTAL_PARTICIPANTS} members.`);
      return;
    }

    setIsAdding(true);
    try {
      const response = await conversationApi.addParticipants(conversationId, [userId]);
      if (response.success) {
        // Parent refreshes participants list
        await onMemberAdded();
        // Remove the added user from search results
        setSearchResults(prev => prev.filter(u => u.id !== userId));
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to add member');
    } finally {
      setIsAdding(false);
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Members</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.modalCloseText}>Done</Text>
          </TouchableOpacity>
        </View>

        {!canAddMembers && (
          <View style={styles.limitBanner}>
            <Text style={styles.limitBannerText}>
              Group is full ({MAX_TOTAL_PARTICIPANTS} members max)
            </Text>
          </View>
        )}

        <View style={styles.searchContainer}>
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search users by name or email..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.searchResultsList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.searchResultRow}
              onPress={() => handleAddMember(item.id)}
              disabled={isAdding || !canAddMembers}
              activeOpacity={0.7}
            >
              <UserAvatar
                name={item.displayName}
                avatarUrl={item.avatarUrl}
                size={40}
              />
              <View style={styles.searchResultInfo}>
                <Text style={styles.searchResultName}>{item.displayName}</Text>
                <Text style={styles.searchResultEmail}>{item.email}</Text>
              </View>
              <View style={[styles.addButton, (!canAddMembers || isAdding) && styles.addButtonDisabled]}>
                <Text style={styles.addButtonText}>Add</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptySearch}>
              {isSearching ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : searchQuery.length > 0 ? (
                <Text style={styles.emptySearchText}>No users found</Text>
              ) : (
                <Text style={styles.emptySearchText}>Search for users to add</Text>
              )}
            </View>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  modalCloseText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
  },
  limitBanner: {
    backgroundColor: colors.error + '20',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  limitBannerText: {
    fontSize: typography.fontSize.sm,
    color: colors.error,
    fontWeight: typography.fontWeight.medium,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  searchResultsList: {
    paddingHorizontal: spacing.lg,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchResultInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  searchResultName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  searchResultEmail: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  emptySearch: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptySearchText: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },
});
