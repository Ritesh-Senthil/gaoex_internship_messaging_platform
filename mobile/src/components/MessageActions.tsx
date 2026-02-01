/**
 * MessageActions Component
 * Action sheet for message interactions (Edit, Delete, React, Copy)
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
import { colors, spacing, typography, borderRadius } from '../constants/theme';

interface MessageActionsProps {
  visible: boolean;
  onClose: () => void;
  messageContent: string;
  isOwnMessage: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReact?: () => void;
  onReply?: () => void;
}

interface ActionItem {
  id: string;
  label: string;
  icon: string;
  onPress: () => void;
  destructive?: boolean;
  requiresOwnership?: boolean;
}

export default function MessageActions({
  visible,
  onClose,
  messageContent,
  isOwnMessage,
  onEdit,
  onDelete,
  onReact,
  onReply,
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
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(),
        },
      ]
    );
  };

  const handleReact = () => {
    onClose();
    onReact?.();
  };

  const actions: ActionItem[] = [
    {
      id: 'react',
      label: 'Add Reaction',
      icon: '😀',
      onPress: handleReact,
    },
    {
      id: 'copy',
      label: 'Copy Text',
      icon: '📋',
      onPress: handleCopy,
    },
    {
      id: 'edit',
      label: 'Edit Message',
      icon: '✏️',
      onPress: handleEdit,
      requiresOwnership: true,
    },
    {
      id: 'delete',
      label: 'Delete Message',
      icon: '🗑️',
      onPress: handleDelete,
      destructive: true,
      requiresOwnership: true,
    },
  ];

  const visibleActions = actions.filter(
    action => !action.requiresOwnership || isOwnMessage
  );

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
              
              <Text style={styles.preview} numberOfLines={2}>
                "{messageContent}"
              </Text>

              <View style={styles.actionsContainer}>
                {visibleActions.map((action, index) => (
                  <TouchableOpacity
                    key={action.id}
                    style={[
                      styles.actionItem,
                      index === visibleActions.length - 1 && styles.actionItemLast,
                    ]}
                    onPress={action.onPress}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.actionIcon}>{action.icon}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  actionsContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionItemLast: {
    borderBottomWidth: 0,
  },
  actionIcon: {
    fontSize: 20,
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
