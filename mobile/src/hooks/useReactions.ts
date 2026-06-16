/**
 * useReactions — shared reaction logic for ChannelScreen, ConversationScreen, ThreadScreen
 *
 * Provides:
 *  - handleAddReaction(messageId, emoji, setMessages)  — optimistic add
 *  - handleToggleReaction(messageId, emoji, hasReacted, setMessages) — optimistic toggle
 *  - applyReactionAdded(data, userId, setMessages)  — for socket handlers
 *  - applyReactionRemoved(data, userId, setMessages) — for socket handlers
 */

import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reactionApi } from '../services/api';

// Minimal shape that every message type satisfies (Message, DMMessage, ThreadMessage)
interface ReactionUser {
  id: string;
  displayName: string;
}

interface ReactionItem {
  emoji: string;
  count: number;
  users: ReactionUser[];
}

interface ReactionableMessage {
  id: string;
  reactions?: ReactionItem[];
}

type SetMessages<T> = React.Dispatch<React.SetStateAction<T[]>>;

// --- Pure helpers (also usable on a single message, e.g. parentMessage in ThreadScreen) ---

function addReactionToMessages<T extends ReactionableMessage>(
  messages: T[],
  messageId: string,
  emoji: string,
  currentUser: ReactionUser,
): T[] {
  return messages.map(msg => {
    if (msg.id !== messageId) return msg;
    const reactions = msg.reactions || [];
    const existing = reactions.find(r => r.emoji === emoji);
    if (existing) {
      // Don't double-add
      if (existing.users.some(u => u.id === currentUser.id)) return msg;
      return {
        ...msg,
        reactions: reactions.map(r =>
          r.emoji === emoji
            ? { ...r, count: r.count + 1, users: [...r.users, currentUser] }
            : r,
        ),
      };
    }
    return {
      ...msg,
      reactions: [...reactions, { emoji, count: 1, users: [currentUser] }],
    };
  });
}

function removeReactionFromMessages<T extends ReactionableMessage>(
  messages: T[],
  messageId: string,
  emoji: string,
  userId: string,
): T[] {
  return messages.map(msg => {
    if (msg.id !== messageId) return msg;
    return {
      ...msg,
      reactions: (msg.reactions || [])
        .map(r =>
          r.emoji === emoji
            ? { ...r, count: r.count - 1, users: r.users.filter(u => u.id !== userId) }
            : r,
        )
        .filter(r => r.count > 0),
    };
  });
}

/** Apply to a single message (for ThreadScreen parentMessage) */
export function applyReactionAddedSingle<T extends ReactionableMessage>(
  msg: T,
  messageId: string,
  emoji: string,
  reactionUser: ReactionUser,
): T {
  if (msg.id !== messageId) return msg;
  const reactions = msg.reactions || [];
  const existing = reactions.find(r => r.emoji === emoji);
  if (existing) {
    if (existing.users.some(u => u.id === reactionUser.id)) return msg;
    return {
      ...msg,
      reactions: reactions.map(r =>
        r.emoji === emoji
          ? { ...r, count: r.count + 1, users: [...r.users, reactionUser] }
          : r,
      ),
    };
  }
  return {
    ...msg,
    reactions: [...reactions, { emoji, count: 1, users: [reactionUser] }],
  };
}

/** Apply to a single message (for ThreadScreen parentMessage) */
export function applyReactionRemovedSingle<T extends ReactionableMessage>(
  msg: T,
  messageId: string,
  emoji: string,
  userId: string,
): T {
  if (msg.id !== messageId) return msg;
  return {
    ...msg,
    reactions: (msg.reactions || [])
      .map(r =>
        r.emoji === emoji
          ? { ...r, count: r.count - 1, users: r.users.filter(u => u.id !== userId) }
          : r,
      )
      .filter(r => r.count > 0),
  };
}

// --- Hook ---

export function useReactions(userId: string | undefined, userDisplayName: string | undefined) {
  const currentUser = useMemo<ReactionUser | null>(
    () => (userId && userDisplayName ? { id: userId, displayName: userDisplayName } : null),
    [userId, userDisplayName],
  );

  /**
   * Add a reaction: paint it immediately (UX-02), then persist. Roll back on error.
   */
  const handleAddReaction = useCallback(
    async <T extends ReactionableMessage>(
      messageId: string,
      emoji: string,
      setMessages: SetMessages<T>,
    ) => {
      if (!currentUser) return;
      Haptics.selectionAsync();
      setMessages(prev => addReactionToMessages(prev, messageId, emoji, currentUser));
      try {
        await reactionApi.addReaction(messageId, emoji);
      } catch (err: any) {
        // Roll back the optimistic add (inverse op for this user).
        setMessages(prev => removeReactionFromMessages(prev, messageId, emoji, currentUser.id));
        Alert.alert('Error', err.message || 'Failed to add reaction');
      }
    },
    [currentUser],
  );

  /**
   * Toggle a reaction: paint it immediately (UX-02), then persist. Roll back on error.
   */
  const handleToggleReaction = useCallback(
    async <T extends ReactionableMessage>(
      messageId: string,
      emoji: string,
      hasReacted: boolean,
      setMessages: SetMessages<T>,
    ) => {
      if (!currentUser) return;
      Haptics.selectionAsync();
      if (hasReacted) {
        setMessages(prev => removeReactionFromMessages(prev, messageId, emoji, currentUser.id));
        try {
          await reactionApi.removeReaction(messageId, emoji);
        } catch (err) {
          // Roll back: re-add what we optimistically removed.
          setMessages(prev => addReactionToMessages(prev, messageId, emoji, currentUser));
          console.error('Failed to remove reaction:', err);
        }
      } else {
        setMessages(prev => addReactionToMessages(prev, messageId, emoji, currentUser));
        try {
          await reactionApi.addReaction(messageId, emoji);
        } catch (err) {
          // Roll back: remove what we optimistically added.
          setMessages(prev => removeReactionFromMessages(prev, messageId, emoji, currentUser.id));
          console.error('Failed to toggle reaction:', err);
        }
      }
    },
    [currentUser],
  );

  /**
   * Apply an incoming socket reaction-added event (skip own reactions).
   */
  const applyReactionAdded = useCallback(
    <T extends ReactionableMessage>(
      data: { messageId: string; emoji: string; user: ReactionUser },
      setMessages: SetMessages<T>,
    ) => {
      if (data.user.id === userId) return; // handled optimistically
      setMessages(prev => addReactionToMessages(prev, data.messageId, data.emoji, data.user));
    },
    [userId],
  );

  /**
   * Apply an incoming socket reaction-removed event (skip own reactions).
   */
  const applyReactionRemoved = useCallback(
    <T extends ReactionableMessage>(
      data: { messageId: string; emoji: string; user: ReactionUser },
      setMessages: SetMessages<T>,
    ) => {
      if (data.user.id === userId) return;
      setMessages(prev => removeReactionFromMessages(prev, data.messageId, data.emoji, data.user.id));
    },
    [userId],
  );

  return {
    handleAddReaction,
    handleToggleReaction,
    applyReactionAdded,
    applyReactionRemoved,
  };
}
