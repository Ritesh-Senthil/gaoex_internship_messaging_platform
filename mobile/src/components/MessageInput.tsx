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
import { shouldIgnoreStalePostSendChange } from '../utils/messageInputGuard';

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
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  // Controlled selection — only set transiently to reposition the caret after a
  // mention is inserted, then cleared so the user regains normal control.
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  const inputRef = useRef<TextInput>(null);
  // After send, iOS may replay the previous message via onChangeText (autocorrect).
  // Track what was sent so we ignore replays without swallowing the first new keystroke.
  const lastSentTextRef = useRef<string | null>(null);
  // Latest known caret position (start of selection), kept in a ref to avoid
  // stale-closure issues between onChangeText and onSelectionChange.
  const caretRef = useRef(0);
  // The text range [start, end) of the @mention currently being typed, so we
  // replace exactly that span (not the last '@' in the whole string).
  const mentionRangeRef = useRef<{ start: number; end: number } | null>(null);

  // Detect a mention at the given caret position and refresh suggestions.
  const refreshMention = useCallback((text: string, caret: number) => {
    const query = detectMentionQuery(text, caret);
    if (query !== null) {
      // query === text.slice(atIndex + 1, caret) → atIndex = caret - query.length - 1
      mentionRangeRef.current = { start: caret - query.length - 1, end: caret };
      setSuggestions(filterMentionSuggestions(query, users, roles, includeSpecialMentions));
    } else {
      mentionRangeRef.current = null;
      setSuggestions([]);
    }
  }, [users, roles, includeSpecialMentions]);

  const handleSelectionChange = useCallback((
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) => {
    const { start } = event.nativeEvent.selection;
    caretRef.current = start;
    // Release the transiently-controlled selection so typing isn't pinned.
    if (selection) setSelection(undefined);
    refreshMention(value, start);
  }, [value, selection, refreshMention]);

  const handleTextChange = useCallback((text: string) => {
    if (lastSentTextRef.current !== null) {
      if (shouldIgnoreStalePostSendChange(lastSentTextRef.current, text, value)) {
        return;
      }
      lastSentTextRef.current = null;
    }

    // onChangeText doesn't report the caret, so estimate it from the edit delta
    // relative to the previous value. onSelectionChange corrects it immediately
    // after, but this keeps mid-text edits accurate in the meantime.
    const delta = text.length - value.length;
    const estimatedCaret = Math.max(0, Math.min(text.length, caretRef.current + delta));
    caretRef.current = estimatedCaret;

    onChangeText(text);
    refreshMention(text, estimatedCaret);
  }, [value, onChangeText, refreshMention]);

  const handleSelectMention = useCallback((suggestion: MentionSuggestion) => {
    const range = mentionRangeRef.current;
    if (!range) return;

    const before = value.slice(0, range.start);
    const after = value.slice(range.end);

    // Ensure a single space follows the inserted mention.
    const needsSpace = after.length === 0 || after[0] !== ' ';
    const insert = needsSpace ? `${suggestion.insertText} ` : suggestion.insertText;
    const newText = `${before}${insert}${after}`;
    const newCaret = before.length + insert.length;

    mentionRangeRef.current = null;
    setSuggestions([]);
    caretRef.current = newCaret;
    onChangeText(newText);
    // Position the caret right after the inserted mention.
    setSelection({ start: newCaret, end: newCaret });
    inputRef.current?.focus();
  }, [value, onChangeText]);

  const handleSend = useCallback(() => {
    const canSendNow = canSendOverride !== undefined ? canSendOverride : value.trim().length > 0;
    if (canSendNow && !isSending) {
      setSuggestions([]);
      mentionRangeRef.current = null;
      lastSentTextRef.current = value;
      onSend();
      // Keep the native field in sync with the cleared controlled value.
      requestAnimationFrame(() => {
        inputRef.current?.setNativeProps({ text: '' });
      });
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
          selection={selection}
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
