/**
 * MessageActions Component (Discord-style)
 *
 * Unified action sheet with:
 *  - Quick-react emoji row at the top
 *  - Grouped action sections with dividers
 *  - Ionicons instead of emoji for action icons
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Clipboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

interface MessageActionsProps {
  visible: boolean;
  onClose: () => void;
  messageContent: string;
  isOwnMessage: boolean;
  canDelete?: boolean;
  isPinned?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onQuickReact?: (emoji: string) => void;
  onReply?: () => void;
  onPin?: () => void;
}

export default function MessageActions({
  visible,
  onClose,
  messageContent,
  isOwnMessage,
  canDelete = false,
  isPinned = false,
  onEdit,
  onDelete,
  onQuickReact,
  onReply,
  onPin,
}: MessageActionsProps) {
  const handleCopy = () => {
    Clipboard.setString(messageContent);
    Alert.alert('Copied', 'Message copied to clipboard');
    onClose();
  };

  const handleEdit = () => {
    onClose();
    onEdit?.();
  };

  const handleDelete = () => {
    onClose();
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.() },
      ],
    );
  };

  const handleReply = () => {
    onClose();
    onReply?.();
  };

  const handlePin = () => {
    onClose();
    onPin?.();
  };

  const handleQuickReact = (emoji: string) => {
    onClose();
    onQuickReact?.(emoji);
  };

  // --- Build grouped action sections ---

  type ActionItem = {
    id: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    destructive?: boolean;
  };

  const contextActions: ActionItem[] = [];
  if (onReply) {
    contextActions.push({ id: 'reply', label: 'Reply in Thread', icon: 'chatbubble-outline', onPress: handleReply });
  }
  if (onPin) {
    contextActions.push({
      id: 'pin',
      label: isPinned ? 'Unpin Message' : 'Pin Message',
      icon: 'pin-outline',
      onPress: handlePin,
    });
  }
  contextActions.push({ id: 'copy', label: 'Copy Text', icon: 'copy-outline', onPress: handleCopy });

  const ownerActions: ActionItem[] = [];
  if (isOwnMessage && onEdit) {
    ownerActions.push({ id: 'edit', label: 'Edit Message', icon: 'create-outline', onPress: handleEdit });
  }
  if ((isOwnMessage || canDelete) && onDelete) {
    ownerActions.push({ id: 'delete', label: 'Delete Message', icon: 'trash-outline', onPress: handleDelete, destructive: true });
  }

  const renderActionGroup = (actions: ActionItem[], isLast: boolean) => (
    <View style={[styles.actionGroup, !isLast && styles.actionGroupBorder]}>
      {actions.map((action, index) => (
        <TouchableOpacity
          key={action.id}
          style={[
            styles.actionItem,
            index < actions.length - 1 && styles.actionItemBorder,
          ]}
          onPress={action.onPress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={action.icon}
            size={20}
            color={action.destructive ? colors.error : colors.text}
            style={styles.actionIcon}
          />
          <Text
            style={[
              styles.actionLabel,
              action.destructive && styles.actionLabelDestructive,
            ]}
          >
            {action.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const hasOwnerActions = ownerActions.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              {/* Message preview */}
              <Text style={styles.preview} numberOfLines={2}>
                {`\u201C${messageContent}\u201D`}
              </Text>

              {/* Quick react row */}
              {onQuickReact && (
                <View style={styles.quickReactRow}>
                  {QUICK_EMOJIS.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.quickReactButton}
                      onPress={() => handleQuickReact(emoji)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickReactEmoji}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Action groups */}
              <View style={styles.actionsContainer}>
                {renderActionGroup(contextActions, !hasOwnerActions)}
                {hasOwnerActions && renderActionGroup(ownerActions, true)}
              </View>

              {/* Cancel */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  preview: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },

  // Quick react row
  quickReactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  quickReactButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickReactEmoji: {
    fontSize: 20,
  },

  // Action groups
  actionsContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionGroup: {},
  actionGroupBorder: {
    borderBottomWidth: 2,
    borderBottomColor: colors.backgroundSecondary,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  actionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionIcon: {
    marginRight: spacing.md,
  },
  actionLabel: {
    fontSize: typography.fontSize.md,
    color: colors.text,
    fontWeight: typography.fontWeight.medium,
  },
  actionLabelDestructive: {
    color: colors.error,
  },

  // Cancel
  cancelButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: typography.fontSize.md,
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
});
