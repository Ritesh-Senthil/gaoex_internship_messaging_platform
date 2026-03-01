/**
 * MessageInput Component
 * Shared message input with mention autocomplete support
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import MentionAutocomplete, {
  MentionSuggestion,
  MentionUser,
  MentionRole,
  filterMentionSuggestions,
  detectMentionQuery,
} from './MentionAutocomplete';

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  isSending?: boolean;
  users?: MentionUser[];
  roles?: MentionRole[];
  includeSpecialMentions?: boolean;
  sendButtonText?: string;
  maxLength?: number;
  /** Override the default canSend logic (e.g., when attachments are selected) */
  canSendOverride?: boolean;
}

export default function MessageInput({
  value,
  onChangeText,
  onSend,
  placeholder = 'Type a message...',
  isSending = false,
  users = [],
  roles = [],
  includeSpecialMentions = true,
  sendButtonText = '→',
  maxLength = 4000,
  canSendOverride,
}: MessageInputProps) {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const inputRef = useRef<TextInput>(null);

  const handleSelectionChange = useCallback((
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) => {
    const { start } = event.nativeEvent.selection;
    setCursorPosition(start);
    
    // Check for mention query
    const query = detectMentionQuery(value, start);
    setMentionQuery(query);
    
    if (query !== null) {
      const filtered = filterMentionSuggestions(query, users, roles, includeSpecialMentions);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [value, users, roles, includeSpecialMentions]);

  const handleTextChange = useCallback((text: string) => {
    onChangeText(text);
    
    // Re-detect mention query with estimated cursor position
    const query = detectMentionQuery(text, text.length);
    setMentionQuery(query);
    
    if (query !== null) {
      const filtered = filterMentionSuggestions(query, users, roles, includeSpecialMentions);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [onChangeText, users, roles, includeSpecialMentions]);

  const handleSelectMention = useCallback((suggestion: MentionSuggestion) => {
    // Find the last @ symbol in the text - this is what triggered the mention
    const atIndex = value.lastIndexOf('@');
    
    if (atIndex === -1) return;
    
    // Everything before the @ stays
    const beforeMention = value.slice(0, atIndex);
    
    // Find where the partial mention query ends (at space or end of string)
    let queryEndIndex = value.length;
    for (let i = atIndex + 1; i < value.length; i++) {
      if (value[i] === ' ') {
        queryEndIndex = i;
        break;
      }
    }
    
    // Everything after the query (if any) is preserved
    const afterMention = value.slice(queryEndIndex);
    
    // Build new text: before + mention + after
    let newText = `${beforeMention}${suggestion.insertText}${afterMention}`;
    
    // Ensure there's a space after the mention if nothing follows
    if (afterMention.length === 0 && !newText.endsWith(' ')) {
      newText += ' ';
    }
    
    onChangeText(newText);
    setMentionQuery(null);
    setSuggestions([]);
    
    // Keep focus on input
    inputRef.current?.focus();
  }, [value, onChangeText]);

  const handleSend = useCallback(() => {
    const canSendNow = canSendOverride !== undefined ? canSendOverride : value.trim().length > 0;
    if (canSendNow && !isSending) {
      setSuggestions([]);
      setMentionQuery(null);
      onSend();
    }
  }, [value, isSending, onSend, canSendOverride]);

  // Use override if provided, otherwise check for text content
  const canSend = canSendOverride !== undefined 
    ? (canSendOverride && !isSending)
    : (value.trim().length > 0 && !isSending);

  return (
    <View style={styles.container}>
      <MentionAutocomplete
        visible={suggestions.length > 0}
        suggestions={suggestions}
        onSelect={handleSelectMention}
      />
      
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={handleTextChange}
          onSelectionChange={handleSelectionChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={maxLength}
          returnKeyType="default"
          blurOnSubmit={false}
        />
        
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.sendButtonText}>{sendButtonText}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
  sendButtonText: {
    fontSize: typography.fontSize.md,
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
    textAlign: 'center',
  },
});
