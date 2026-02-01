/**
 * New Conversation Screen
 * Select a user to start a DM conversation
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';

// Simple debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
  
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
  };
  
  return debounced;
}
import { RootStackParamList } from '../types';
import { userApi, conversationApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface SearchUser {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export default function NewConversationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await userApi.searchUsers(query);
      if (response.success) {
        // Filter out current user
        const filteredUsers = response.data.users.filter(
          (u: SearchUser) => u.id !== user?.id
        );
        setUsers(filteredUsers);
      }
    } catch (err: any) {
      console.error('Failed to search users:', err);
      setError('Failed to search users');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Debounce search
  const debouncedSearch = useCallback(
    debounce((query: string) => searchUsers(query), 300),
    [searchUsers]
  );

  useEffect(() => {
    debouncedSearch(searchQuery);
    return () => debouncedSearch.cancel();
  }, [searchQuery, debouncedSearch]);

  const handleUserSelect = async (selectedUser: SearchUser) => {
    setIsCreating(true);

    try {
      const response = await conversationApi.createConversation([selectedUser.id]);

      if (response.success) {
        const { conversation } = response.data;
        
        // Navigate to the conversation
        navigation.replace('Conversation', {
          conversationId: conversation.id,
          name: selectedUser.displayName,
        });
      }
    } catch (err: any) {
      console.error('Failed to create conversation:', err);
      Alert.alert('Error', 'Failed to start conversation. Please try again.');
      setIsCreating(false);
    }
  };

  const getAvatarColor = (name: string) => {
    const colorList = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colorList.length;
    return colorList[index];
  };

  const renderUser = ({ item }: { item: SearchUser }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleUserSelect(item)}
      activeOpacity={0.7}
      disabled={isCreating}
    >
      <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.displayName) }]}>
        <Text style={styles.avatarText}>
          {item.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.displayName}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isCreating && (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.creatingText}>Starting conversation...</Text>
        </View>
      )}

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name or email..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {isLoading && (
          <ActivityIndicator style={styles.searchSpinner} color={colors.primary} />
        )}
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          searchQuery.trim() ? (
            <View style={styles.emptyContainer}>
              {isLoading ? null : (
                <>
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text style={styles.emptyText}>
                    No users found for "{searchQuery}"
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👆</Text>
              <Text style={styles.emptyTitle}>Search for someone</Text>
              <Text style={styles.emptyText}>
                Type a name or email to find users
              </Text>
            </View>
          )
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
  creatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  creatingText: {
    marginTop: spacing.md,
    color: colors.white,
    fontSize: typography.fontSize.md,
  },
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
  errorContainer: {
    padding: spacing.md,
    backgroundColor: colors.error + '20',
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSize.sm,
    textAlign: 'center',
  },
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
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
});
