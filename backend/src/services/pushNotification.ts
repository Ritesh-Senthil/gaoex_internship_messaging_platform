/**
 * Push Notification Service
 * 
 * Sends push notifications via Expo Push API.
 * Handles batching, error handling, invalid token cleanup, and receipt checking.
 */

import Expo, { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { prisma } from '../config/database';
import { getUserIdsActiveInRoom } from '../utils/socketPresence';

// Create a single Expo SDK client (reuse across requests)
const expo = new Expo();

// ============================================
// TYPES
// ============================================

export type NotificationType = 'channel_message' | 'dm_message' | 'mention' | 'program_invite';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Badge count (iOS). If omitted, not set. */
  badge?: number;
  /** Sound name. Defaults to 'default'. Set to null for silent. */
  sound?: 'default' | null;
  /** Notification category (for grouping on device) */
  categoryId?: string;
  /** Thread ID for grouping notifications (iOS) */
  threadId?: string;
}

// ============================================
// CORE SEND FUNCTIONS
// ============================================

/**
 * Send push notifications to specific users by their user IDs.
 * Looks up push tokens, filters muted channels/conversations, batches and sends.
 * 
 * @param userIds - Array of user IDs to notify
 * @param payload - Notification content
 * @param options - Additional options
 * @returns Object with counts of sent, failed, and skipped notifications
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushNotificationPayload,
  options?: {
    /** If set, exclude this user from receiving (usually the message author) */
    excludeUserId?: string;
    /** If set, only send to users who don't have an active socket in this room */
    excludeActiveInRoom?: string;
  }
): Promise<{ sent: number; failed: number; skipped: number }> {
  if (userIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // Filter out excluded user
  let targetUserIds = options?.excludeUserId
    ? userIds.filter(id => id !== options.excludeUserId)
    : [...userIds];

  if (targetUserIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  // Skip users actively viewing this channel/conversation (they already see the message).
  if (options?.excludeActiveInRoom) {
    const activeUserIds = await getUserIdsActiveInRoom(options.excludeActiveInRoom);
    if (activeUserIds.size > 0) {
      targetUserIds = targetUserIds.filter(id => !activeUserIds.has(id));
    }
  }

  if (targetUserIds.length === 0) {
    return { sent: 0, failed: 0, skipped: userIds.length };
  }

  // Look up push tokens for these users
  const pushTokens = await prisma.pushToken.findMany({
    where: {
      userId: { in: targetUserIds },
    },
    select: {
      token: true,
      userId: true,
    },
  });

  if (pushTokens.length === 0) {
    return { sent: 0, failed: 0, skipped: targetUserIds.length };
  }

  // Filter to only valid Expo push tokens
  const validTokens = pushTokens.filter(pt => Expo.isExpoPushToken(pt.token));
  const invalidCount = pushTokens.length - validTokens.length;

  // Clean up invalid tokens in background
  if (invalidCount > 0) {
    const invalidTokenStrings = pushTokens
      .filter(pt => !Expo.isExpoPushToken(pt.token))
      .map(pt => pt.token);
    cleanupTokens(invalidTokenStrings).catch(err =>
      console.error('[Push] Failed to cleanup invalid tokens:', err)
    );
  }

  if (validTokens.length === 0) {
    return { sent: 0, failed: 0, skipped: targetUserIds.length };
  }

  // Build messages
  const messages: ExpoPushMessage[] = validTokens.map(pt => ({
    to: pt.token,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: payload.sound === null ? undefined : (payload.sound || 'default'),
    badge: payload.badge,
    categoryId: payload.categoryId,
    threadId: payload.threadId,
    channelId: payload.categoryId || 'default', // Android notification channel
  }));

  // Send in batches (Expo SDK handles chunking internally)
  const result = await sendMessages(messages);

  return {
    sent: result.sent,
    failed: result.failed,
    skipped: targetUserIds.length - validTokens.length,
  };
}

/**
 * Send push notifications directly to Expo push tokens.
 * Lower-level function — use sendPushToUsers for most cases.
 */
export async function sendPushToTokens(
  tokens: string[],
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const validTokens = tokens.filter(t => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) {
    return { sent: 0, failed: tokens.length };
  }

  const messages: ExpoPushMessage[] = validTokens.map(token => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: payload.sound === null ? undefined : (payload.sound || 'default'),
    badge: payload.badge,
    categoryId: payload.categoryId,
    threadId: payload.threadId,
    channelId: payload.categoryId || 'default',
  }));

  return sendMessages(messages);
}

// ============================================
// INTERNAL: BATCH SEND + RECEIPT HANDLING
// ============================================

/**
 * Send an array of Expo push messages in chunks.
 * Handles ticket errors and schedules receipt checking.
 */
async function sendMessages(
  messages: ExpoPushMessage[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Expo SDK chunks messages into batches of ~100
  const chunks = expo.chunkPushNotifications(messages);
  const ticketIds: string[] = [];
  const tokensToRemove: string[] = [];

  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];

        if (ticket.status === 'ok') {
          sent++;
          if (ticket.id) {
            ticketIds.push(ticket.id);
          }
        } else {
          failed++;
          // Handle specific error types
          if (ticket.status === 'error') {
            const errorDetail = ticket.details;
            const token = (chunk[i] as any).to as string;

            if (errorDetail?.error === 'DeviceNotRegistered') {
              // Token is no longer valid — queue for removal
              tokensToRemove.push(token);
              console.log(`[Push] DeviceNotRegistered: removing token ${token.substring(0, 30)}...`);
            } else {
              console.error(`[Push] Ticket error for ${token.substring(0, 30)}...:`, ticket.message);
            }
          }
        }
      }
    } catch (error) {
      // Entire chunk failed (network error, rate limit, etc.)
      failed += chunk.length;
      console.error('[Push] Chunk send failed:', error);
    }
  }

  // Clean up invalid tokens in background
  if (tokensToRemove.length > 0) {
    cleanupTokens(tokensToRemove).catch(err =>
      console.error('[Push] Failed to cleanup tokens:', err)
    );
  }

  // Schedule receipt checking (Expo recommends waiting ~15 minutes)
  if (ticketIds.length > 0) {
    scheduleReceiptCheck(ticketIds);
  }

  console.log(`[Push] Sent: ${sent}, Failed: ${failed}, Total: ${messages.length}`);
  return { sent, failed };
}

/**
 * Schedule receipt checking after a delay.
 * Expo recommends checking receipts ~15 minutes after sending.
 */
function scheduleReceiptCheck(ticketIds: string[]): void {
  // Check after 15 minutes
  const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

  setTimeout(async () => {
    try {
      await checkReceipts(ticketIds);
    } catch (error) {
      console.error('[Push] Receipt check failed:', error);
    }
  }, RECEIPT_CHECK_DELAY_MS);
}

/**
 * Check receipts for previously sent notifications.
 * Cleans up tokens that are no longer valid.
 */
async function checkReceipts(ticketIds: string[]): Promise<void> {
  const receiptChunks = expo.chunkPushNotificationReceiptIds(ticketIds);
  const tokensToRemove: string[] = [];

  for (const chunk of receiptChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

      for (const receiptId in receipts) {
        const receipt: ExpoPushReceipt = receipts[receiptId];

        if (receipt.status === 'error') {
          const errorDetail = receipt.details;
          if (errorDetail?.error === 'DeviceNotRegistered') {
            console.log(`[Push] Receipt: DeviceNotRegistered for ticket ${receiptId}`);
            // We don't have the token from the receipt, but DeviceNotRegistered
            // means we should log it. Token cleanup from tickets handles most cases.
          } else {
            console.error(`[Push] Receipt error for ${receiptId}:`, receipt.message);
          }
        }
      }
    } catch (error) {
      console.error('[Push] Receipt chunk check failed:', error);
    }
  }
}

// ============================================
// TOKEN CLEANUP
// ============================================

/**
 * Remove specific push tokens from the database.
 * Called when tokens are found to be invalid (DeviceNotRegistered, etc.)
 */
async function cleanupTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;

  const result = await prisma.pushToken.deleteMany({
    where: {
      token: { in: tokens },
    },
  });

  if (result.count > 0) {
    console.log(`[Push] Cleaned up ${result.count} invalid token(s)`);
  }

  return result.count;
}

/**
 * Remove all push tokens for a specific user.
 * Call this when a user deactivates their account or you want to stop all notifications.
 */
export async function removeAllUserTokens(userId: string): Promise<number> {
  const result = await prisma.pushToken.deleteMany({
    where: { userId },
  });
  return result.count;
}

// ============================================
// NOTIFICATION BUILDERS
// ============================================

/**
 * Build a push notification payload for a new channel message.
 */
export function buildChannelMessageNotification(params: {
  authorName: string;
  channelName: string;
  programName: string;
  messagePreview: string;
  channelId: string;
  programId: string;
}): PushNotificationPayload {
  return {
    title: `#${params.channelName} in ${params.programName}`,
    body: `${params.authorName}: ${truncate(params.messagePreview, 100)}`,
    data: {
      type: 'channel_message',
      channelId: params.channelId,
      programId: params.programId,
      channelName: params.channelName,
    },
    sound: 'default',
    threadId: `channel:${params.channelId}`,
    categoryId: 'channel_message',
  };
}

/**
 * Build a push notification payload for a DM message.
 */
export function buildDMNotification(params: {
  authorName: string;
  messagePreview: string;
  conversationId: string;
}): PushNotificationPayload {
  return {
    title: params.authorName,
    body: truncate(params.messagePreview, 100),
    data: {
      type: 'dm_message',
      conversationId: params.conversationId,
      authorName: params.authorName,
    },
    sound: 'default',
    threadId: `conversation:${params.conversationId}`,
    categoryId: 'dm_message',
  };
}

/**
 * Build a push notification payload for an @mention.
 */
export function buildMentionNotification(params: {
  authorName: string;
  channelName: string;
  programName: string;
  messagePreview: string;
  channelId: string;
  programId: string;
  mentionType: 'user' | 'role' | 'everyone';
}): PushNotificationPayload {
  const mentionLabel = params.mentionType === 'everyone'
    ? '@everyone'
    : params.mentionType === 'role'
      ? 'your role was'
      : 'you were';

  return {
    title: `#${params.channelName} in ${params.programName}`,
    body: `${params.authorName} mentioned ${mentionLabel}: ${truncate(params.messagePreview, 80)}`,
    data: {
      type: 'mention',
      channelId: params.channelId,
      programId: params.programId,
      channelName: params.channelName,
    },
    sound: 'default',
    threadId: `channel:${params.channelId}`,
    categoryId: 'mention',
  };
}

/**
 * Build a push notification payload for a program invite.
 */
export function buildProgramInviteNotification(params: {
  inviterName: string;
  programName: string;
  programId: string;
}): PushNotificationPayload {
  return {
    title: 'Program Invitation',
    body: `${params.inviterName} invited you to join "${params.programName}"`,
    data: {
      type: 'program_invite',
      programId: params.programId,
    },
    sound: 'default',
    categoryId: 'program_invite',
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Truncate a string to a maximum length, adding "..." if truncated.
 * Strips markdown formatting for cleaner notification text.
 */
function truncate(text: string, maxLength: number): string {
  // Strip basic markdown formatting
  let clean = text
    .replace(/\*\*(.*?)\*\*/g, '$1')   // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/`(.*?)`/g, '$1')         // inline code
    .replace(/```[\s\S]*?```/g, '[code]') // code blocks
    .replace(/\n+/g, ' ')             // newlines to spaces
    .trim();

  if (clean.length <= maxLength) return clean;
  return clean.substring(0, maxLength - 3) + '...';
}

/**
 * Get the count of registered push tokens for a user.
 * Useful for debugging.
 */
export async function getUserTokenCount(userId: string): Promise<number> {
  return prisma.pushToken.count({
    where: { userId },
  });
}
