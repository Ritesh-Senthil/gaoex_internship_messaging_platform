/**
 * EditProfileModal — self-contained edit profile modal
 *
 * Receives all state and handlers from useEditProfile hook via props.
 * Manages display name, bio (with markdown preview), and banner color.
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import MarkdownText from './MarkdownText';
import { BIO_MAX } from '../hooks/useEditProfile';

// ─── Banner Color Presets ─────────────────────────────────────
const BANNER_COLORS = [
  '#0A84FF', '#2563EB', '#6366F1', '#8B5CF6',
  '#EC4899', '#EF4444', '#F97316', '#F59E0B',
  '#EAB308', '#22C55E', '#14B8A6', '#06B6D4',
];

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  displayName: string;
  onDisplayNameChange: (text: string) => void;
  bio: string;
  onBioChange: (text: string) => void;
  bannerColor: string;
  onBannerColorChange: (hex: string) => void;
}

export default function EditProfileModal({
  visible,
  onClose,
  onSave,
  isSaving,
  displayName,
  onDisplayNameChange,
  bio,
  onBioChange,
  bannerColor,
  onBannerColorChange,
}: EditProfileModalProps) {
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
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={onSave} disabled={isSaving}>
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.modalSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
          {/* Banner Color Preview */}
          <View style={[styles.bannerPreview, { backgroundColor: bannerColor }]} />

          {/* Banner Color Picker */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Banner Color</Text>
            <View style={styles.colorGrid}>
              {BANNER_COLORS.map((hex) => (
                <TouchableOpacity
                  key={hex}
                  onPress={() => onBannerColorChange(hex)}
                  activeOpacity={0.7}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: hex },
                    bannerColor === hex && styles.colorSwatchSelected,
                  ]}
                >
                  {bannerColor === hex && (
                    <Text style={styles.colorSwatchCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Display Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={(t) => onDisplayNameChange(t.slice(0, 50))}
              placeholder="Enter your display name"
              placeholderTextColor={colors.textMuted}
              maxLength={50}
            />
            <Text style={styles.charCount}>{displayName.length}/50</Text>
          </View>

          {/* Bio / About Me */}
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>About Me</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={(t) => onBioChange(t.slice(0, BIO_MAX))}
              placeholder="Tell others about yourself… (supports **markdown**)"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={4}
              maxLength={BIO_MAX}
              textAlignVertical="top"
            />
            <Text
              style={[
                styles.charCount,
                bio.length > BIO_MAX - 20 && styles.charCountWarn,
              ]}
            >
              {bio.length}/{BIO_MAX}
            </Text>
          </View>

          {/* Markdown hint */}
          <View style={styles.hintRow}>
            <Text style={styles.hintText}>
              Supports **bold**, *italic*, and `code` markdown
            </Text>
          </View>

          {/* Bio preview (live) */}
          {bio.trim().length > 0 && (
            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Preview</Text>
              <View style={styles.previewBox}>
                <MarkdownText style={styles.previewText}>{bio}</MarkdownText>
              </View>
            </View>
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
  charCountWarn: {
    color: colors.error,
  },
  hintRow: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  hintText: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // ── Banner preview ────────────────────────────
  bannerPreview: {
    height: 72,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },

  // ── Color grid ────────────────────────────────
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: colors.white,
    ...shadows.sm,
  },
  colorSwatchCheck: {
    fontSize: 18,
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
  },

  // ── Bio editor ────────────────────────────────
  bioInput: {
    height: 110,
    paddingTop: spacing.md,
  },

  // ── Preview box ───────────────────────────────
  previewBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
});
