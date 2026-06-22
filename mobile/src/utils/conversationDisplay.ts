/**
 * Helpers for 1:1 vs group conversation display names and avatars in list UI.
 */

import { Conversation } from '../types';

export interface ProfileUpdatePayload {
  userId: string;
  displayName?: string;
  avatarUrl?: string | null;
}

/** The other participant in a 1:1 DM (not the current user). */
export function getOtherParticipant(
  conv: Conversation,
  currentUserId: string | undefined,
): Conversation['participants'][number] | undefined {
  if (conv.isGroup || !currentUserId) return undefined;
  return conv.participants.find(p => p.userId !== currentUserId);
}

/**
 * Apply a live profile update to a conversation row.
 * For 1:1 chats, top-level name/avatar always reflect the *other* person — never self.
 */
export function applyProfileUpdateToConversation(
  conv: Conversation,
  data: ProfileUpdatePayload,
  currentUserId: string | undefined,
): Conversation {
  const hasParticipant = conv.participants.some(p => p.userId === data.userId);
  if (!hasParticipant) return conv;

  const participants = conv.participants.map(p =>
    p.userId === data.userId
      ? {
          ...p,
          displayName: data.displayName ?? p.displayName,
          avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : p.avatarUrl,
        }
      : p,
  );

  const patch: Partial<Conversation> = { participants };

  if (!conv.isGroup && data.userId !== currentUserId) {
    patch.name = data.displayName ?? conv.name;
    patch.avatarUrl = data.avatarUrl !== undefined ? data.avatarUrl : conv.avatarUrl;
  }

  return { ...conv, ...patch };
}
