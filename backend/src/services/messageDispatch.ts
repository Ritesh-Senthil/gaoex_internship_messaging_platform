/**
 * Shared message-dispatch helpers.
 *
 * Centralizes the "what happens after a channel message is created" pipeline so
 * that text messages AND file uploads behave identically: mention resolution,
 * unread/mention counters, real-time unread events, and push notifications.
 *
 * Before this existed, file-upload messages skipped unread + push entirely
 * (RT-03), and mention parsing / MENTION_EVERYONE enforcement (SEC-04) lived
 * inline in the text route only.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  sendPushToUsers,
  buildChannelMessageNotification,
  buildMentionNotification,
} from './pushNotification';

// Either the singleton client or a transaction client (PrismaClient is
// structurally assignable to TransactionClient).
type Db = Prisma.TransactionClient;

export interface ResolvedMentions {
  mentionedUsers: string[];
  mentionedRoles: string[];
  mentionEveryone: boolean;
}

/**
 * Parse @mentions from message content against a program's members and roles.
 *
 * As of PE-04 the mobile composer emits *stable* tokens — `<@userId>` for users
 * and `<@&roleId>` for roles — so mentions survive renames and name collisions
 * without re-parsing display names. We resolve those tokens against the program's
 * actual members/roles. Legacy messages (and older clients) that still contain
 * literal `@DisplayName` text are also matched, so already-stored content keeps
 * highlighting correctly. `@everyone`/`@here` only set `mentionEveryone` when the
 * author actually has the MENTION_EVERYONE permission (SEC-04) — otherwise
 * they're treated as text.
 */
export async function resolveChannelMentions(
  content: string,
  programId: string,
  canMentionEveryone: boolean,
): Promise<ResolvedMentions> {
  const mentionedUsers: string[] = [];
  const mentionedRoles: string[] = [];
  let mentionEveryone = false;

  if ((content.includes('@everyone') || content.includes('@here')) && canMentionEveryone) {
    mentionEveryone = true;
  }

  // Stable tokens (PE-04): <@userId> and <@&roleId>. The `&` distinguishes roles.
  const tokenRegex = /<@(&)?([^>\s]+)>/g;
  const tokenUserIds = new Set<string>();
  const tokenRoleIds = new Set<string>();
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRegex.exec(content)) !== null) {
    const id = tokenMatch[2];
    if (tokenMatch[1]) tokenRoleIds.add(id);
    else tokenUserIds.add(id);
  }

  // Legacy fallback: literal @DisplayName (multi-word names use non-breaking
  // spaces). Skips tokens — their ids never look like display names — so old and
  // new formats can coexist in the same string harmlessly.
  const nameRegex = /@([^\s@<>]+(?:\u00A0[^\s@<>]+)*)/g;
  const mentionNames: string[] = [];
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = nameRegex.exec(content)) !== null) {
    const name = nameMatch[1].replace(/\u00A0/g, ' ');
    if (name !== 'everyone' && name !== 'here') mentionNames.push(name);
  }

  const needsLookup = tokenUserIds.size > 0 || tokenRoleIds.size > 0 || mentionNames.length > 0;
  if (needsLookup) {
    const [members, roles] = await Promise.all([
      prisma.programMembership.findMany({
        where: { programId },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      prisma.role.findMany({ where: { programId }, select: { id: true, name: true } }),
    ]);

    const memberIds = new Set(members.map((m) => m.user.id));
    const roleIds = new Set(roles.map((r) => r.id));

    // Resolve stable tokens — only keep ids that are real program members/roles.
    for (const uid of tokenUserIds) {
      if (memberIds.has(uid) && !mentionedUsers.includes(uid)) mentionedUsers.push(uid);
    }
    for (const rid of tokenRoleIds) {
      if (roleIds.has(rid) && !mentionedRoles.includes(rid)) mentionedRoles.push(rid);
    }

    // Resolve legacy @DisplayName text against member/role names.
    for (const name of mentionNames) {
      const lower = name.toLowerCase();
      const user = members.find((m) => m.user.displayName.toLowerCase() === lower);
      if (user && !mentionedUsers.includes(user.user.id)) {
        mentionedUsers.push(user.user.id);
        continue;
      }
      const role = roles.find(
        (r) => r.name.toLowerCase() === lower || r.name.toLowerCase() === `@${lower}`,
      );
      if (role && !mentionedRoles.includes(role.id)) {
        mentionedRoles.push(role.id);
      }
    }
  }

  return { mentionedUsers, mentionedRoles, mentionEveryone };
}

/**
 * Replace stable mention tokens (`<@userId>`, `<@&roleId>`) in message content
 * with human-readable `@DisplayName` / `@RoleName` for PLAIN-TEXT contexts that
 * don't have an id→name map — most importantly push-notification previews
 * (PE-04b). Without this, a push would read like "<@abc123> check this".
 * Unknown ids are dropped. Returns the content untouched (no DB hit) when it
 * contains no tokens. Legacy `@DisplayName` content already reads fine, so it's
 * left as-is.
 */
export async function renderMentionTokensToText(
  content: string,
  programId: string,
): Promise<string> {
  const tokenRegex = /<@(&)?([^>\s]+)>/g;
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(content)) !== null) {
    if (match[1]) roleIds.add(match[2]);
    else userIds.add(match[2]);
  }
  if (userIds.size === 0 && roleIds.size === 0) return content;

  const [members, roles] = await Promise.all([
    userIds.size > 0
      ? prisma.programMembership.findMany({
          where: { programId, userId: { in: Array.from(userIds) } },
          include: { user: { select: { id: true, displayName: true } } },
        })
      : Promise.resolve([] as { user: { id: string; displayName: string } }[]),
    roleIds.size > 0
      ? prisma.role.findMany({
          where: { programId, id: { in: Array.from(roleIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const userName = new Map(members.map((m) => [m.user.id, m.user.displayName]));
  const roleName = new Map(roles.map((r) => [r.id, r.name.replace(/^@/, '')]));

  return content
    .replace(/<@(&)?([^>\s]+)>/g, (_full, amp, id) => {
      const name = amp ? roleName.get(id) : userName.get(id);
      return name ? `@${name}` : '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Expand resolved mentions into the concrete set of user IDs to notify,
 * excluding the author.
 */
export async function collectChannelMentionRecipients(
  programId: string,
  mentions: ResolvedMentions,
  authorId: string,
): Promise<string[]> {
  let userIds: string[] = [...mentions.mentionedUsers];

  if (mentions.mentionEveryone) {
    const members = await prisma.programMembership.findMany({
      where: { programId },
      select: { userId: true },
    });
    userIds = members.map((m) => m.userId);
  } else if (mentions.mentionedRoles.length > 0) {
    const memberRoles = await prisma.memberRole.findMany({
      where: { roleId: { in: mentions.mentionedRoles }, membership: { programId } },
      include: { membership: { select: { userId: true } } },
    });
    userIds = [...new Set([...userIds, ...memberRoles.map((mr) => mr.membership.userId)])];
  }

  return userIds.filter((uid) => uid !== authorId);
}

/**
 * Increment unread mention counters for the given users, creating ChannelRead
 * rows where needed. Accepts a transaction client so it can run atomically with
 * the message insert (DAT-01).
 */
export async function incrementMentionCounts(
  db: Db,
  channelId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;

  const existing = await db.channelRead.findMany({
    where: { channelId, userId: { in: userIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((r) => r.userId));

  if (existingIds.size > 0) {
    await db.channelRead.updateMany({
      where: { channelId, userId: { in: Array.from(existingIds) } },
      data: { mentionCount: { increment: 1 } },
    });
  }

  const newIds = userIds.filter((uid) => !existingIds.has(uid));
  if (newIds.length > 0) {
    await db.channelRead.createMany({
      data: newIds.map((uid) => ({
        userId: uid,
        channelId,
        lastReadAt: new Date(0),
        mentionCount: 1,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * Emit `unread:channel` (+ `unread:mention`) to the program room. Sockets
 * already in the channel room are excluded server-side (RT-02) via `.except()`,
 * so clients can trust any unread event they receive is for them.
 */
export function emitChannelUnreadEvents(
  io: any,
  params: {
    channelId: string;
    programId: string;
    authorId: string;
    mentionRecipientIds: string[];
  },
): void {
  if (!io) return;

  io.to(`program:${params.programId}`)
    .except(`channel:${params.channelId}`)
    .emit('unread:channel', {
      channelId: params.channelId,
      programId: params.programId,
      authorId: params.authorId,
    });

  if (params.mentionRecipientIds.length > 0) {
    io.to(`program:${params.programId}`)
      .except(`channel:${params.channelId}`)
      .emit('unread:mention', {
        channelId: params.channelId,
        programId: params.programId,
        mentionedUserIds: params.mentionRecipientIds,
      });
  }
}

/**
 * Fire-and-forget push notifications for a channel message. Sends a mention
 * push to mentioned (non-muted) users and a regular channel push to everyone
 * else (non-muted). Safe to call for file-only messages — a sensible preview
 * is substituted when there's no text.
 */
export function pushChannelMessage(params: {
  channelId: string;
  programId: string;
  channelName: string;
  programName: string;
  authorId: string;
  authorName: string;
  content: string;
  mentions: ResolvedMentions;
  mentionRecipientIds: string[];
  hasAttachments?: boolean;
}): void {
  (async () => {
    try {
      const allMemberships = await prisma.programMembership.findMany({
        where: { programId: params.programId },
        select: { userId: true },
      });
      const allMemberIds = allMemberships
        .map((m) => m.userId)
        .filter((uid) => uid !== params.authorId);
      if (allMemberIds.length === 0) return;

      const mutedRecords = await prisma.channelRead.findMany({
        where: { channelId: params.channelId, userId: { in: allMemberIds }, isMuted: true },
        select: { userId: true },
      });
      const mutedIds = new Set(mutedRecords.map((r) => r.userId));

      const renderedContent = await renderMentionTokensToText(params.content, params.programId);
      const preview = renderedContent.trim() || (params.hasAttachments ? '📎 Sent an attachment' : '');
      const mentionedSet = new Set(params.mentionRecipientIds);

      const mentionTargets = params.mentionRecipientIds.filter((uid) => !mutedIds.has(uid));
      if (mentionTargets.length > 0) {
        const mentionType = params.mentions.mentionEveryone
          ? 'everyone'
          : params.mentions.mentionedRoles.length > 0
            ? 'role'
            : 'user';
        await sendPushToUsers(
          mentionTargets,
          buildMentionNotification({
            authorName: params.authorName,
            channelName: params.channelName,
            programName: params.programName,
            messagePreview: preview,
            channelId: params.channelId,
            programId: params.programId,
            mentionType,
          }),
          { excludeActiveInRoom: `channel:${params.channelId}` },
        );
      }

      const channelTargets = allMemberIds.filter(
        (uid) => !mentionedSet.has(uid) && !mutedIds.has(uid),
      );
      if (channelTargets.length > 0) {
        await sendPushToUsers(
          channelTargets,
          buildChannelMessageNotification({
            authorName: params.authorName,
            channelName: params.channelName,
            programName: params.programName,
            messagePreview: preview,
            channelId: params.channelId,
            programId: params.programId,
          }),
          { excludeActiveInRoom: `channel:${params.channelId}` },
        );
      }
    } catch (error) {
      console.error('[Push] Channel message push failed:', error);
    }
  })();
}
