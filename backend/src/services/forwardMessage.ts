/**
 * Message forwarding — read source, validate destination ACLs, clone content
 * + attachments, and dispatch through the normal real-time/push pipelines.
 */

import { prisma } from '../config/database';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { canAccessChannel, canAccessConversation } from '../utils/access';
import { Permissions, hasPermission } from '../utils/permissions';
import { getUserPermissions } from '../utils/roleHelpers';
import {
  renderMentionTokensToText,
  emitChannelUnreadEvents,
  pushChannelMessage,
} from './messageDispatch';
import { sendPushToUsers, buildDMNotification } from './pushNotification';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_COMMENT_LENGTH = 500;
const MAX_QUOTED_BODY = 2000;

export type ForwardDestinationType = 'channel' | 'conversation';

export interface ForwardDestinationsResult {
  programs: {
    id: string;
    name: string;
    channels: {
      id: string;
      name: string;
      type: 'TEXT' | 'ANNOUNCEMENT';
      programId: string;
      programName: string;
      categoryName: string | null;
      isPrivate: boolean;
    }[];
  }[];
  conversations: {
    id: string;
    name: string;
    isGroup: boolean;
    avatarUrl: string | null;
  }[];
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + '...';
}

/** True when the user may post in this channel (membership, private access, perms). */
export async function canPostToChannel(
  userId: string,
  channelId: string,
  isSuperAdmin = false,
): Promise<boolean> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, programId: true, type: true, isPrivate: true, isArchived: true },
  });
  if (!channel || channel.isArchived) return false;
  if (isSuperAdmin) return true;

  const membership = await prisma.programMembership.findUnique({
    where: { userId_programId: { userId, programId: channel.programId } },
    select: { id: true },
  });
  if (!membership) return false;

  if (channel.isPrivate && !(await canAccessChannel(userId, channelId, false))) {
    return false;
  }

  const userPerms = await getUserPermissions(userId, channel.programId, false);
  if (!hasPermission(userPerms, Permissions.SEND_MESSAGES)) return false;

  if (channel.type === 'ANNOUNCEMENT') {
    if (!hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS)) return false;
  }

  return true;
}

/** True when the user may read a message (source ACL). */
export async function assertCanReadMessage(
  userId: string,
  messageId: string,
  isSuperAdmin: boolean,
) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      attachments: true,
      channel: {
        select: {
          id: true,
          name: true,
          programId: true,
          isPrivate: true,
          program: { select: { name: true } },
        },
      },
      conversation: {
        select: {
          id: true,
          isGroup: true,
          name: true,
          participants: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
        },
      },
      parent: {
        select: {
          author: { select: { displayName: true } },
        },
      },
    },
  });

  if (!message) {
    throw new NotFoundError('Message not found');
  }

  if (message.channelId && message.channel) {
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: message.channel.programId },
      },
    });
    if (!membership && !isSuperAdmin) {
      throw new ForbiddenError('You do not have access to this message');
    }
    if (
      message.channel.isPrivate &&
      !(await canAccessChannel(userId, message.channelId, isSuperAdmin))
    ) {
      throw new ForbiddenError('You do not have access to this message');
    }
  } else if (message.conversationId) {
    if (!(await canAccessConversation(userId, message.conversationId))) {
      throw new ForbiddenError('You do not have access to this message');
    }
  } else {
    throw new BadRequestError('Message has no valid source');
  }

  return message;
}

function buildSourceLabel(
  message: Awaited<ReturnType<typeof assertCanReadMessage>>,
  viewerUserId: string,
): string {
  if (message.channel) {
    return `#${message.channel.name} (${message.channel.program.name})`;
  }

  const conv = message.conversation!;
  if (conv.isGroup) {
    const names = conv.participants
      .filter(p => p.user.id !== viewerUserId)
      .map(p => p.user.displayName);
    const groupLabel = conv.name || names.join(', ') || 'Group';
    return `group "${groupLabel}"`;
  }

  const other = conv.participants.find(p => p.user.id !== viewerUserId);
  return `DM with ${other?.user.displayName || 'Unknown'}`;
}

async function buildForwardContent(params: {
  sourceContent: string;
  sourceAuthorName: string;
  sourceLabel: string;
  threadParentAuthor?: string;
  programId?: string;
  comment?: string;
  attachmentCount: number;
}): Promise<string> {
  let body = params.sourceContent.trim();
  if (params.programId) {
    body = await renderMentionTokensToText(body, params.programId);
  }

  if (!body && params.attachmentCount > 0) {
    body =
      params.attachmentCount === 1
        ? '📎 Attachment'
        : `📎 ${params.attachmentCount} attachments`;
  }

  body = truncate(body, MAX_QUOTED_BODY);

  const threadNote = params.threadParentAuthor
    ? ` (reply to ${params.threadParentAuthor})`
    : '';

  const quote = `> **Forwarded from ${params.sourceLabel}**${threadNote}\n> **${params.sourceAuthorName}:** ${body || '(empty message)'}`;

  const parts: string[] = [];
  if (params.comment?.trim()) {
    parts.push(params.comment.trim());
  }
  parts.push(quote);

  const content = parts.join('\n\n');
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestError(
      `Forwarded message is too long (${content.length} chars). Shorten your comment or forward a shorter message.`,
    );
  }
  return content;
}

export async function listForwardDestinations(
  userId: string,
  isSuperAdmin: boolean,
  exclude?: { channelId?: string; conversationId?: string },
): Promise<ForwardDestinationsResult> {
  const programs: ForwardDestinationsResult['programs'] = [];

  const memberships = await prisma.programMembership.findMany({
    where: { userId, program: { status: 'ACTIVE' } },
    include: {
      program: {
        select: {
          id: true,
          name: true,
          channels: {
            where: { isArchived: false },
            select: {
              id: true,
              name: true,
              type: true,
              isPrivate: true,
              category: { select: { name: true } },
            },
            orderBy: { position: 'asc' },
          },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  for (const membership of memberships) {
    const postableChannels: ForwardDestinationsResult['programs'][0]['channels'] = [];

    for (const channel of membership.program.channels) {
      if (exclude?.channelId && channel.id === exclude.channelId) continue;
      if (!(await canPostToChannel(userId, channel.id, isSuperAdmin))) continue;

      postableChannels.push({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        programId: membership.program.id,
        programName: membership.program.name,
        categoryName: channel.category?.name ?? null,
        isPrivate: channel.isPrivate,
      });
    }

    if (postableChannels.length > 0) {
      programs.push({
        id: membership.program.id,
        name: membership.program.name,
        channels: postableChannels,
      });
    }
  }

  // Super admin may post to channels in programs they aren't a member of — include
  // those programs too (rare, but keeps parity with other super-admin paths).
  if (isSuperAdmin) {
    const memberProgramIds = new Set(memberships.map(m => m.program.id));
    const otherPrograms = await prisma.program.findMany({
      where: { id: { notIn: Array.from(memberProgramIds) }, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        channels: {
          where: { isArchived: false },
          select: {
            id: true,
            name: true,
            type: true,
            isPrivate: true,
            category: { select: { name: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    for (const program of otherPrograms) {
      const postableChannels = program.channels
        .filter(ch => !exclude?.channelId || ch.id !== exclude.channelId)
        .map(ch => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          programId: program.id,
          programName: program.name,
          categoryName: ch.category?.name ?? null,
          isPrivate: ch.isPrivate,
        }));

      if (postableChannels.length > 0) {
        programs.push({ id: program.id, name: program.name, channels: postableChannels });
      }
    }
  }

  const conversationsRaw = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: {
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const conversations: ForwardDestinationsResult['conversations'] = conversationsRaw
    .filter(c => !exclude?.conversationId || c.id !== exclude.conversationId)
    .map(conv => {
      const otherParticipants = conv.participants.filter(p => p.userId !== userId);
      const isGroup = conv.isGroup;

      let name: string;
      let avatarUrl: string | null = null;

      if (isGroup) {
        name =
          conv.name ||
          otherParticipants.map(p => p.user.displayName).join(', ') ||
          'Group';
      } else {
        const other = otherParticipants[0];
        name = other?.user.displayName || 'Unknown';
        avatarUrl = other?.user.avatarUrl ?? null;
      }

      return { id: conv.id, name, isGroup, avatarUrl };
    });

  return { programs, conversations };
}

export async function forwardMessage(params: {
  userId: string;
  isSuperAdmin: boolean;
  authorName: string;
  messageId: string;
  destinationType: ForwardDestinationType;
  destinationId: string;
  comment?: string;
  io?: any;
}) {
  const { userId, isSuperAdmin, authorName, messageId, destinationType, destinationId, comment, io } =
    params;

  if (comment && comment.length > MAX_COMMENT_LENGTH) {
    throw new BadRequestError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  const source = await assertCanReadMessage(userId, messageId, isSuperAdmin);

  // Block forwarding to the same destination.
  if (destinationType === 'channel' && source.channelId === destinationId) {
    throw new BadRequestError('Message is already in this channel');
  }
  if (destinationType === 'conversation' && source.conversationId === destinationId) {
    throw new BadRequestError('Message is already in this conversation');
  }

  const sourceLabel = buildSourceLabel(source, userId);
  const content = await buildForwardContent({
    sourceContent: source.content,
    sourceAuthorName: source.author.displayName,
    sourceLabel,
    threadParentAuthor: source.parent?.author.displayName,
    programId: source.channel?.programId,
    comment,
    attachmentCount: source.attachments.length,
  });

  if (destinationType === 'channel') {
    if (!(await canPostToChannel(userId, destinationId, isSuperAdmin))) {
      throw new ForbiddenError('You do not have permission to send messages in this channel');
    }

    const channel = await prisma.channel.findUnique({
      where: { id: destinationId },
      select: {
        id: true,
        programId: true,
        name: true,
        program: { select: { name: true } },
      },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const message = await prisma.$transaction(async tx => {
      const created = await tx.message.create({
        data: {
          authorId: userId,
          channelId: destinationId,
          content,
          mentionedUsers: [],
          mentionedRoles: [],
          mentionEveryone: false,
          attachments: {
            create: source.attachments.map(att => ({
              fileName: att.fileName,
              fileUrl: att.fileUrl,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
            })),
          },
        },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true } },
          attachments: true,
        },
      });
      return created;
    });

    if (io) {
      io.to(`channel:${destinationId}`).emit('new_message', {
        ...message,
        parentMessageId: null,
      });

      emitChannelUnreadEvents(io, {
        channelId: destinationId,
        programId: channel.programId,
        authorId: userId,
        mentionRecipientIds: [],
      });
    }

    pushChannelMessage({
      channelId: destinationId,
      programId: channel.programId,
      channelName: channel.name,
      programName: channel.program.name,
      authorId: userId,
      authorName,
      content,
      mentions: { mentionedUsers: [], mentionedRoles: [], mentionEveryone: false },
      mentionRecipientIds: [],
      hasAttachments: message.attachments.length > 0,
    });

    return {
      message,
      destination: {
        type: 'channel' as const,
        channelId: destinationId,
        channelName: channel.name,
        programId: channel.programId,
      },
    };
  }

  // DM / group destination
  if (!(await canAccessConversation(userId, destinationId))) {
    throw new ForbiddenError('You are not a participant in this conversation');
  }

  const message = await prisma.$transaction(async tx => {
    const created = await tx.message.create({
      data: {
        authorId: userId,
        conversationId: destinationId,
        content,
        attachments: {
          create: source.attachments.map(att => ({
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            mimeType: att.mimeType,
            fileSize: att.fileSize,
          })),
        },
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: true,
      },
    });

    await tx.conversation.update({
      where: { id: destinationId },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  const formattedMessage = {
    id: message.id,
    content: message.content,
    authorId: message.authorId,
    author: message.author,
    parentMessageId: null,
    replyCount: 0,
    isEdited: false,
    isPinned: false,
    attachments: message.attachments.map(att => ({
      id: att.id,
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
    })),
    reactions: [],
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };

  if (io) {
    io.to(`conversation:${destinationId}`).emit('new_dm_message', {
      conversationId: destinationId,
      message: formattedMessage,
    });

    const otherParticipants = await prisma.conversationParticipant.findMany({
      where: { conversationId: destinationId, userId: { not: userId } },
      select: { userId: true },
    });

    for (const p of otherParticipants) {
      io.to(`user:${p.userId}`)
        .except(`conversation:${destinationId}`)
        .emit('unread:dm', {
          conversationId: destinationId,
          recipientUserId: p.userId,
          senderId: userId,
        });
    }
  }

  (async () => {
    try {
      const recipients = await prisma.conversationParticipant.findMany({
        where: {
          conversationId: destinationId,
          userId: { not: userId },
          isMuted: false,
        },
        select: { userId: true },
      });
      const recipientIds = recipients.map(p => p.userId);
      if (recipientIds.length === 0) return;

      await sendPushToUsers(
        recipientIds,
        buildDMNotification({
          authorName,
          messagePreview: content.trim(),
          conversationId: destinationId,
        }),
        { excludeActiveInRoom: `conversation:${destinationId}` },
      );
    } catch (err) {
      console.error('[Push] Forward DM push failed:', err);
    }
  })();

  const conv = await prisma.conversation.findUnique({
    where: { id: destinationId },
    select: { isGroup: true, name: true },
  });

  return {
    message: formattedMessage,
    destination: {
      type: 'conversation' as const,
      conversationId: destinationId,
      conversationName: conv?.name || 'Conversation',
      isGroup: conv?.isGroup ?? false,
    },
  };
}
