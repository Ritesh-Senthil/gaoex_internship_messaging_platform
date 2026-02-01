/**
 * MentionAutocomplete Component
 * Shows user/role suggestions when typing @ in messages
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

export interface MentionUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface MentionRole {
  id: string;
  name: string;
  color: string;
}

export interface MentionSuggestion {
  type: 'user' | 'role' | 'special';
  id: string;
  displayText: string;
  insertText: string;
  color?: string;
}

interface MentionAutocompleteProps {
  visible: boolean;
  suggestions: MentionSuggestion[];
  onSelect: (suggestion: MentionSuggestion) => void;
  maxHeight?: number;
}

export default function MentionAutocomplete({
  visible,
  suggestions,
  onSelect,
  maxHeight = 200,
}: MentionAutocompleteProps) {
  if (!visible || suggestions.length === 0) return null;

  const getIcon = (type: string) => {
    switch (type) {
      case 'user':
        return '👤';
      case 'role':
        return '🏷️';
      case 'special':
        return '📢';
      default:
        return '•';
    }
  };

  const getAvatarColor = (name: string) => {
    const colorList = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];
    const index = name.charCodeAt(0) % colorList.length;
    return colorList[index];
  };

  const renderSuggestion = ({ item }: { item: MentionSuggestion }) => (
    <TouchableOpacity
      style={styles.suggestionItem}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      {item.type === 'user' ? (
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.displayText) }]}>
          <Text style={styles.avatarText}>
            {item.displayText.charAt(0).toUpperCase()}
          </Text>
        </View>
      ) : (
        <View style={[styles.iconContainer, item.color && { backgroundColor: item.color + '30' }]}>
          <Text style={styles.icon}>{getIcon(item.type)}</Text>
        </View>
      )}
      
      <View style={styles.textContainer}>
        <Text style={[styles.displayText, item.color && { color: item.color }]}>
          {item.displayText}
        </Text>
        <Text style={styles.typeLabel}>
          {item.type === 'special' ? 'Notify' : item.type}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Animated.View style={[styles.container, { maxHeight }]}>
      <FlatList
        data={suggestions}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderSuggestion}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Animated.View>
  );
}

// Helper function to filter suggestions based on query
export function filterMentionSuggestions(
  query: string,
  users: MentionUser[],
  roles: MentionRole[],
  includeSpecial = true
): MentionSuggestion[] {
  const suggestions: MentionSuggestion[] = [];
  const lowerQuery = query.toLowerCase();

  // Add special mentions (@everyone, @here)
  if (includeSpecial) {
    if ('everyone'.startsWith(lowerQuery)) {
      suggestions.push({
        type: 'special',
        id: 'everyone',
        displayText: '@everyone',
        insertText: '@everyone',
      });
    }
    if ('here'.startsWith(lowerQuery)) {
      suggestions.push({
        type: 'special',
        id: 'here',
        displayText: '@here',
        insertText: '@here',
      });
    }
  }

  // Filter users
  const matchingUsers = users
    .filter(u => u.displayName.toLowerCase().includes(lowerQuery))
    .slice(0, 5)
    .map(u => ({
      type: 'user' as const,
      id: u.id,
      displayText: u.displayName,
      insertText: `@${u.displayName}`,
    }));
  suggestions.push(...matchingUsers);

  // Filter roles
  const matchingRoles = roles
    .filter(r => r.name.toLowerCase().includes(lowerQuery))
    .slice(0, 3)
    .map(r => ({
      type: 'role' as const,
      id: r.id,
      displayText: `@${r.name}`,
      insertText: `@${r.name}`,
      color: r.color,
    }));
  suggestions.push(...matchingRoles);

  return suggestions.slice(0, 8);
}

// Helper to detect if user is typing a mention
export function detectMentionQuery(text: string, cursorPosition: number): string | null {
  // Look backwards from cursor to find @
  let start = cursorPosition - 1;
  
  while (start >= 0) {
    const char = text[start];
    if (char === '@') {
      // Found @ - extract the query after it
      const query = text.slice(start + 1, cursorPosition);
      // Make sure there's no space before the @
      if (start === 0 || /\s/.test(text[start - 1])) {
        return query;
      }
      return null;
    }
    if (/\s/.test(char)) {
      // Hit whitespace before finding @
      return null;
    }
    start--;
  }
  
  return null;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  icon: {
    fontSize: 16,
  },
  textContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayText: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  typeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
});
