/**
 * StatusModal — self-contained custom status modal
 *
 * Receives all state and handlers from useCustomStatus hook via props.
 * Manages status emoji, text, duration, and clear functionality.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { STATUS_DURATIONS, STATUS_TEXT_MAX } from '../hooks/useCustomStatus';

interface StatusModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
  showClearButton: boolean;
  // Draft state
  emoji: string;
  onEmojiChange: (text: string) => void;
  statusText: string;
  onStatusTextChange: (text: string) => void;
  durationIdx: number;
  onDurationChange: (idx: number) => void;
}

export default function StatusModal({
  visible,
  onClose,
  onSave,
  onClear,
  isSaving,
  showClearButton,
  emoji,
  onEmojiChange,
  statusText,
  onStatusTextChange,
  durationIdx,
  onDurationChange,
}: StatusModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Set Status</Text>
          <TouchableOpacity onPress={onSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.modalSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          {/* Status preview pill */}
          <View style={styles.statusPreviewContainer}>
            <View style={styles.statusPreviewPill}>
              <Text style={styles.statusPreviewEmoji}>
                {emoji || '😀'}
              </Text>
              <Text style={styles.statusPreviewText} numberOfLines={1}>
                {statusText || "What's your status?"}
              </Text>
            </View>
          </View>

          {/* Emoji input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Emoji</Text>
            <TextInput
              style={[styles.input, styles.emojiInput]}
              value={emoji}
              onChangeText={(t) => {
                const trimmed = t.trim();
                if (trimmed.length <= 4) onEmojiChange(trimmed);
              }}
              placeholder="😀"
              placeholderTextColor={colors.textMuted}
              maxLength={4}
              textAlign="center"
            />
            <Text style={styles.hintText}>
              Paste or type an emoji (e.g. 🎉, 💻, ☕)
            </Text>
          </View>

          {/* Status text input */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Status Text</Text>
            <TextInput
              style={styles.input}
              value={statusText}
              onChangeText={(t) => onStatusTextChange(t.slice(0, STATUS_TEXT_MAX))}
              placeholder="What are you up to?"
              placeholderTextColor={colors.textMuted}
              maxLength={STATUS_TEXT_MAX}
            />
            <Text style={styles.charCount}>{statusText.length}/{STATUS_TEXT_MAX}</Text>
          </View>

          {/* Duration picker */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Clear After</Text>
            <View style={styles.durationGrid}>
              {STATUS_DURATIONS.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => onDurationChange(idx)}
                  activeOpacity={0.7}
                  style={[
                    styles.durationChip,
                    durationIdx === idx && styles.durationChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      durationIdx === idx && styles.durationChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Clear Status button (only if there's an active status) */}
          {showClearButton && (
            <TouchableOpacity
              style={styles.clearStatusButton}
              onPress={() => {
                Alert.alert(
                  'Clear Status',
                  'Remove your current status?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: onClear },
                  ],
                );
              }}
              disabled={isSaving}
            >
              <Text style={styles.clearStatusText}>Clear Status</Text>
            </TouchableOpacity>
          )}

          <View style={{ height: spacing.xxxl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Modal shell ────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  modalCancelText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
  },
  modalSaveText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary,
  },
  modalScrollContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },

  // ── Shared field styles ────────────────────────
  fieldGroup: {
    marginTop: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  charCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  hintText: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // ── Status preview ────────────────────────────
  statusPreviewContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  statusPreviewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  statusPreviewEmoji: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  statusPreviewText: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    maxWidth: 200,
  },

  // ── Emoji input ───────────────────────────────
  emojiInput: {
    fontSize: 28,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },

  // ── Duration picker ───────────────────────────
  durationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  durationChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  durationChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  durationChipTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },

  // ── Clear status ──────────────────────────────
  clearStatusButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.error + '15',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  clearStatusText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error,
  },
});
