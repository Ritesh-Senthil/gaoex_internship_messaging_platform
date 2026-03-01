/**
 * Profile Screen
 * Discord-style profile with banner, avatar, bio, custom status, and settings menu.
 *
 * Refactored: logic extracted into useAvatar, useEditProfile, useCustomStatus hooks.
 * Modals extracted into EditProfileModal and StatusModal components.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import { APP_CONFIG } from '../constants/config';
import { useAuthStore } from '../store/authStore';
import MarkdownText from '../components/MarkdownText';
import EditProfileModal from '../components/EditProfileModal';
import StatusModal from '../components/StatusModal';

// Hooks
import { useAvatar } from '../hooks/useAvatar';
import { useEditProfile } from '../hooks/useEditProfile';
import { useCustomStatus } from '../hooks/useCustomStatus';

// ─── Layout Constants ────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_MARGIN = spacing.lg;
const CARD_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2;
const BANNER_HEIGHT = 100;
const AVATAR_SIZE = 84;
const AVATAR_BORDER = 4;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const DEFAULT_BANNER_COLOR = colors.primary;

// ─── Account Info Helpers ─────────────────────────────────────
function formatProvider(provider?: string | null): string {
  if (!provider) return 'Email';
  switch (provider.toLowerCase()) {
    case 'google':   return 'Google';
    case 'github':   return 'GitHub';
    case 'apple':    return 'Apple';
    case 'firebase': return 'Email';
    default:         return provider.charAt(0).toUpperCase() + provider.slice(1);
  }
}

function providerIconName(provider?: string | null): keyof typeof Ionicons.glyphMap {
  if (!provider) return 'key-outline';
  switch (provider.toLowerCase()) {
    case 'google':   return 'logo-google';
    case 'github':   return 'logo-github';
    case 'apple':    return 'logo-apple';
    default:         return 'key-outline';
  }
}

function formatJoinDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ProfileScreen() {
  const { user, logout, isLoading, updateUser } = useAuthStore();

  // ─── Hooks ──────────────────────────────────────────────────
  const { isUploadingAvatar, avatarLoadError, setAvatarLoadError, handleAvatarPress } =
    useAvatar({ user, updateUser });

  const {
    isEditModalVisible, editDisplayName, setEditDisplayName,
    editBio, setEditBio, editBannerColor, setEditBannerColor,
    isSaving, handleEditProfile, handleSaveProfile, closeEditModal,
  } = useEditProfile({ user, updateUser });

  const {
    isStatusModalVisible, closeStatusModal,
    draftStatusEmoji, setDraftStatusEmoji,
    draftStatusText, setDraftStatusText,
    draftDurationIdx, setDraftDurationIdx,
    isSavingStatus, showStatus,
    handleOpenStatus, handleSaveStatus, handleClearStatus,
  } = useCustomStatus({ user, updateUser });

  // ─── Guard ──────────────────────────────────────────────────
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Derived ────────────────────────────────────────────────
  const bannerColor = user?.bannerColor || DEFAULT_BANNER_COLOR;
  const initial = user?.displayName?.charAt(0).toUpperCase() || '?';
  const showAvatarImage = !!user?.avatarUrl && !avatarLoadError;

  // ─── Actions ────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout },
    ]);
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Profile Card (Discord-style) ────────────── */}
        <View style={styles.profileCard}>
          {/* Banner */}
          <View style={[styles.banner, { backgroundColor: bannerColor }]} />

          {/* Avatar — overlaps the banner */}
          <View style={styles.avatarRow}>
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.7}
              disabled={isUploadingAvatar}
              style={styles.avatarTouchable}
            >
              <View style={styles.avatarRing}>
                <View style={styles.avatarClip}>
                  {showAvatarImage ? (
                    <Image
                      source={{ uri: user!.avatarUrl! }}
                      style={styles.avatarImage}
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>{initial}</Text>
                    </View>
                  )}

                  {isUploadingAvatar && (
                    <View style={styles.avatarOverlay}>
                      <ActivityIndicator size="small" color={colors.white} />
                    </View>
                  )}
                </View>

                {!isUploadingAvatar && (
                  <View style={styles.editBadge}>
                    <Text style={styles.editBadgeIcon}>✎</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {user?.isSuperAdmin && (
              <View style={styles.badgeRow}>
                <View style={styles.adminPill}>
                  <Text style={styles.adminPillText}>ADMIN</Text>
                </View>
              </View>
            )}
          </View>

          {/* Identity section */}
          <View style={styles.identitySection}>
            <Text style={styles.displayName}>{user?.displayName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>

          {/* Custom status (tappable) */}
          {showStatus && (
            <TouchableOpacity onPress={handleOpenStatus} activeOpacity={0.7}>
              <View style={styles.statusPill}>
                {user?.statusEmoji ? (
                  <Text style={styles.statusEmoji}>{user.statusEmoji}</Text>
                ) : null}
                {user?.statusText ? (
                  <Text style={styles.statusText} numberOfLines={1}>
                    {user.statusText}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}

          {/* Divider before bio */}
          {user?.bio ? <View style={styles.cardDivider} /> : null}

          {/* Bio / About Me */}
          {user?.bio ? (
            <View style={styles.bioSection}>
              <Text style={styles.bioLabel}>ABOUT ME</Text>
              <MarkdownText style={styles.bioText}>{user.bio}</MarkdownText>
            </View>
          ) : (
            <View style={{ height: spacing.lg }} />
          )}
        </View>

        {/* ── Menu Items ──────────────────────────────── */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account</Text>

          <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuText}>Edit Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleOpenStatus}>
            <View style={styles.menuIconWrap}>
              <Ionicons name={showStatus ? 'chatbubble-ellipses-outline' : 'happy-outline'} size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuText}>{showStatus ? 'Edit Status' : 'Set Status'}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── Account Info (read-only) ────────────── */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account Info</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{user.email || '—'}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name={providerIconName(user.authProvider)} size={18} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Sign-in Method</Text>
                <Text style={styles.infoValue}>{formatProvider(user.authProvider)}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue}>{formatJoinDate(user.createdAt)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>About</Text>

          <View style={styles.menuItem}>
            <View style={styles.menuIconWrap}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.menuText}>Version</Text>
            <Text style={styles.menuValue}>{APP_CONFIG.VERSION}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={isLoading}>
          <Text style={styles.logoutText}>{isLoading ? 'Logging out...' : 'Logout'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Modals ──────────────────────────────────── */}
      <EditProfileModal
        visible={isEditModalVisible}
        onClose={closeEditModal}
        onSave={handleSaveProfile}
        isSaving={isSaving}
        displayName={editDisplayName}
        onDisplayNameChange={setEditDisplayName}
        bio={editBio}
        onBioChange={setEditBio}
        bannerColor={editBannerColor}
        onBannerColorChange={setEditBannerColor}
      />

      <StatusModal
        visible={isStatusModalVisible}
        onClose={closeStatusModal}
        onSave={handleSaveStatus}
        onClear={handleClearStatus}
        isSaving={isSavingStatus}
        showClearButton={showStatus}
        emoji={draftStatusEmoji}
        onEmojiChange={setDraftStatusEmoji}
        statusText={draftStatusText}
        onStatusTextChange={setDraftStatusText}
        durationIdx={draftDurationIdx}
        onDurationChange={setDraftDurationIdx}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },

  // ── Profile Card ──────────────────────────────
  profileCard: {
    marginHorizontal: CARD_MARGIN,
    marginTop: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.backgroundSecondary,
    overflow: 'hidden',
    ...shadows.md,
  },
  banner: {
    height: BANNER_HEIGHT,
    width: '100%',
  },

  // ── Avatar row ────────────────────────────────
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    marginTop: -AVATAR_OVERLAP,
  },
  avatarTouchable: {},
  avatarRing: {
    width: AVATAR_SIZE + AVATAR_BORDER * 2,
    height: AVATAR_SIZE + AVATAR_BORDER * 2,
    borderRadius: (AVATAR_SIZE + AVATAR_BORDER * 2) / 2,
    borderWidth: AVATAR_BORDER,
    borderColor: colors.backgroundSecondary,
    backgroundColor: colors.backgroundSecondary,
    position: 'relative',
  },
  avatarClip: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surfaceLight,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.backgroundSecondary,
  },
  editBadgeIcon: {
    fontSize: 12,
    color: colors.text,
    fontWeight: typography.fontWeight.bold,
  },

  // ── Badges ────────────────────────────────────
  badgeRow: {
    flexDirection: 'row',
    marginLeft: 'auto',
    marginBottom: spacing.sm,
  },
  adminPill: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  adminPillText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.background,
    letterSpacing: 0.5,
  },

  // ── Identity ──────────────────────────────────
  identitySection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  displayName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
  },
  email: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Status pill ───────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    maxWidth: CARD_WIDTH - spacing.lg * 2,
  },
  statusEmoji: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  // ── Divider ───────────────────────────────────
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },

  // ── Bio ───────────────────────────────────────
  bioSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  bioLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  bioText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  // ── Menu Sections ─────────────────────────────
  menuSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  menuIconWrap: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuText: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  menuValue: {
    fontSize: typography.fontSize.md,
    color: colors.textMuted,
  },

  // ── Account Info ──────────────────────────────
  infoCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  infoIconWrap: {
    width: 24,
    alignItems: 'center',
    marginRight: spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: typography.fontSize.md,
    color: colors.text,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 24 + spacing.md,
  },

  // ── Logout ────────────────────────────────────
  logoutButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.error + '15',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  logoutText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error,
  },
});
