/**
 * Group Info Screen
 * Displays group details: member list, rename, add members, leave group.
 * Navigated to from ConversationScreen header for group conversations.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { RootStackParamList, ConversationParticipant } from '../types';
import UserAvatar from '../components/UserAvatar';
import AddMembersModal, { MAX_TOTAL_PARTICIPANTS } from '../components/AddMembersModal';
import { conversationApi, userApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useMute } from '../hooks/useMute';
import {
  subscribeToGroupEvents,
  GroupUpdatedEventData,
  GroupParticipantAddedEventData,
  GroupParticipantLeftEventData,
} from '../services/socket';

type RouteProps = RouteProp<RootStackParamList, 'GroupInfo'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── Constants ──
const MAX_GROUP_NAME_LENGTH = 100;

export default function GroupInfoScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavigationProp>();
  const { conversationId, groupName: initialGroupName } = route.params;
  const { user } = useAuthStore();

  // ── Group state ──
  const [isLoading, setIsLoading] = useState(true);
  const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
  const [groupName, setGroupName] = useState(initialGroupName);
  const [customGroupName, setCustomGroupName] = useState<string | null>(null); // The raw custom name (null = auto-generated)
  const [createdById, setCreatedById] = useState<string | null>(null);

  // ── Rename state ──
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [isRenameSubmitting, setIsRenameSubmitting] = useState(false);

  // ── Add members modal state ──
  const [showAddModal, setShowAddModal] = useState(false);

  // ── Leave state ──
  const [isLeaving, setIsLeaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Mute (shared hook handles fetch, optimistic toggle, store sync) ──
  const { isMuted, isMuteLoading, handleToggleMute } = useMute('conversation', conversationId);

  // ── Fetch group details ──
  const fetchGroupDetails = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      const response = await conversationApi.getConversation(conversationId);
      if (response.success) {
        const conv = response.data.conversation;
        setParticipants(conv.participants || []);
        setGroupName(conv.name);
        setCustomGroupName(conv.groupName ?? null);
        setCreatedById(conv.createdById ?? null);
      }
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load group details');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchGroupDetails();
  }, [fetchGroupDetails]);

  // ── Update header title ──
  useEffect(() => {
    navigation.setOptions({ title: 'Group Info' });
  }, [navigation]);

  // ── Listen for real-time group changes ──
  useEffect(() => {
    const unsubscribe = subscribeToGroupEvents({
      onGroupUpdated: (data: GroupUpdatedEventData) => {
        if (data.conversationId !== conversationId) return;
        setGroupName(data.displayName);
        setCustomGroupName(data.name);
      },
      onGroupParticipantAdded: (data: GroupParticipantAddedEventData) => {
        if (data.conversationId !== conversationId) return;
        setParticipants(prev => {
          const existingIds = new Set(prev.map(p => p.userId));
          const newOnes = data.addedUsers.filter(u => !existingIds.has(u.userId));
          return [...prev, ...newOnes];
        });
      },
      onGroupParticipantLeft: (data: GroupParticipantLeftEventData) => {
        if (data.conversationId !== conversationId) return;
        setParticipants(prev => prev.filter(p => p.userId !== data.userId));
      },
    });

    return () => unsubscribe();
  }, [conversationId]);

  // ── Rename handlers ──
  const handleStartRename = () => {
    setRenameText(customGroupName || '');
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameText('');
  };

  const handleSaveRename = async () => {
    const newName = renameText.trim();
    if (isRenameSubmitting) return;

    setIsRenameSubmitting(true);
    try {
      const response = await conversationApi.renameGroup(conversationId, newName);
      if (response.success) {
        const conv = response.data.conversation;
        setGroupName(conv.name);
        setCustomGroupName(conv.groupName ?? null);
        setIsRenaming(false);
        setRenameText('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to rename group');
    } finally {
      setIsRenameSubmitting(false);
    }
  };

  // ── Leave group ──
  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave Group',
      'Are you sure you want to leave this group? You will no longer receive messages from this conversation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (isLeaving) return;
            setIsLeaving(true);
            try {
              await conversationApi.leaveConversation(conversationId);
              navigation.navigate('Main');
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to leave group');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ],
    );
  };

  // ── Member tap → profile ──
  const handleMemberPress = useCallback(async (memberId: string, memberName: string) => {
    if (memberId === user?.id) return; // Don't navigate to own profile
    try {
      const res = await userApi.getSharedProgram(memberId);
      if (res.success && res.data.programId) {
        navigation.navigate('MemberProfile', {
          programId: res.data.programId,
          userId: memberId,
          memberName,
        });
      } else {
        Alert.alert('Profile Unavailable', 'You don\'t share any programs with this user.');
      }
    } catch {
      Alert.alert('Error', 'Could not load profile.');
    }
  }, [navigation, user?.id]);

  // ── Render member row ──
  const renderMember = (participant: ConversationParticipant) => {
    const isSelf = participant.userId === user?.id;
    const isCreator = participant.userId === createdById;

    return (
      <TouchableOpacity
        key={participant.userId}
        style={styles.memberRow}
        onPress={() => handleMemberPress(participant.userId, participant.displayName)}
        disabled={isSelf}
        activeOpacity={0.7}
      >
        <UserAvatar
          name={participant.displayName}
          avatarUrl={participant.avatarUrl}
          size={40}
          showStatus={participant.isOnline}
          statusColor={colors.online}
        />
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {participant.displayName}
              {isSelf ? ' (you)' : ''}
            </Text>
            {isCreator && (
              <View style={styles.creatorBadge}>
                <Text style={styles.creatorBadgeText}>Creator</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberStatus}>
            {participant.isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const canAddMembers = participants.length < MAX_TOTAL_PARTICIPANTS;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchGroupDetails(true)}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Group Avatar + Name ── */}
        <View style={styles.headerSection}>
          <View style={styles.groupAvatarWrapper}>
            <UserAvatar name={groupName} avatarUrl={null} size={72} />
            <View style={styles.groupAvatarBadge}>
              <Text style={styles.groupAvatarBadgeText}>{participants.length}</Text>
            </View>
          </View>

          {isRenaming ? (
            <View style={styles.renameContainer}>
              <TextInput
                style={styles.renameInput}
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Enter group name (or leave blank)"
                placeholderTextColor={colors.textMuted}
                maxLength={MAX_GROUP_NAME_LENGTH}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveRename}
              />
              <Text style={styles.charCount}>
                {renameText.length}/{MAX_GROUP_NAME_LENGTH}
              </Text>
              <View style={styles.renameActions}>
                <TouchableOpacity
                  style={styles.renameCancelButton}
                  onPress={handleCancelRename}
                >
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameSaveButton, isRenameSubmitting && styles.buttonDisabled]}
                  onPress={handleSaveRename}
                  disabled={isRenameSubmitting}
                >
                  {isRenameSubmitting ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.renameSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.groupDisplayName} numberOfLines={2}>
                {groupName}
              </Text>
              <TouchableOpacity
                style={styles.renameIconButton}
                onPress={handleStartRename}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="pencil" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Members ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Members ({participants.length})
            </Text>
            {canAddMembers && (
              <TouchableOpacity
                style={styles.addMemberButton}
                onPress={() => setShowAddModal(true)}
              >
                <Text style={styles.addMemberIcon}>+</Text>
                <Text style={styles.addMemberText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {participants.map(renderMember)}
        </View>

        {/* ── Settings (mute + leave) ── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.muteRow}
            onPress={handleToggleMute}
            disabled={isMuteLoading}
            activeOpacity={0.7}
          >
            <View style={styles.muteInfo}>
              <Text style={styles.muteLabel}>Mute Notifications</Text>
              <Text style={styles.muteDescription}>
                {isMuted ? 'Notifications are silenced' : 'You will receive notifications'}
              </Text>
            </View>
            <Ionicons
              name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
              size={22}
              color={colors.textSecondary}
              style={isMuteLoading ? { opacity: 0.4 } : undefined}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leaveButton}
            onPress={handleLeaveGroup}
            disabled={isLeaving}
          >
            {isLeaving ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.leaveButtonText}>Leave Group</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Add Members Modal ── */}
      <AddMembersModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        conversationId={conversationId}
        participants={participants}
        currentUserId={user?.id || ''}
        onMemberAdded={() => fetchGroupDetails(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },

  // ── Header / Group Info ──
  headerSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupAvatarWrapper: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  groupAvatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.background,
  },
  groupAvatarBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  groupDisplayName: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    textAlign: 'center',
    flexShrink: 1,
  },
  renameIconButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  // ── Rename ──
  renameContainer: {
    width: '100%',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  renameInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  charCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  renameCancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  renameCancelText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  renameSaveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    minWidth: 60,
    alignItems: 'center',
  },
  renameSaveText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // ── Sections ──
  section: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },

  // ── Add Member Button ──
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  addMemberIcon: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  addMemberText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },

  // ── Member Row ──
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    flexShrink: 1,
  },
  memberStatus: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  creatorBadge: {
    backgroundColor: colors.accent + '25',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  creatorBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.bold,
    color: colors.accent,
    letterSpacing: 0.3,
  },

  // ── Mute Row ──
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  muteInfo: {
    flex: 1,
  },
  muteLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  muteDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Leave Button ──
  leaveButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  leaveButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error,
  },

});
