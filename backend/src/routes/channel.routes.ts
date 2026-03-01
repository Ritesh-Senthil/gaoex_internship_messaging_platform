/**
 * Channel Routes
 * Handles channel details and message operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { getFileCategory } from '../config/supabase';
import { Permissions, hasPermission } from '../utils/permissions';
import { getUserPermissions } from '../utils/roleHelpers';
import {
  sendPushToUsers,
  buildChannelMessageNotification,
  buildMentionNotification,
} from '../services/pushNotification';

const router = Router();

/**
 * GET /api/channels/:id
 * Get channel details
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: {
        program: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check if user is a member of the program
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
      include: {
        memberRoles: {
          include: {
            role: {
              select: { id: true, tier: true, permissions: true },
            },
          },
        },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Check private channel access
    if (channel.isPrivate && membership) {
      const userTier = membership.memberRoles.length 
        ? Math.min(...membership.memberRoles.map(mr => mr.role.tier))
        : 2;
      
      // Admins (tier 0-1) can always access
      if (userTier > 1 && !req.user!.isSuperAdmin) {
        // Check if user has explicit permission
        const hasOverride = await prisma.permissionOverride.findFirst({
          where: {
            channelId: id,
            OR: [
              { userId },
              { roleId: { in: membership.memberRoles.map(mr => mr.role.id) } },
            ],
            allow: { gt: BigInt(0) },
          },
        });

        if (!hasOverride) {
          throw new ForbiddenError('You do not have access to this private channel');
        }
      }
    }

    // Determine if user can post (for announcement channels)
    const userPerms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
    const canPost = channel.type !== 'ANNOUNCEMENT' || hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS);
    const canManageMessages = hasPermission(userPerms, Permissions.MANAGE_MESSAGES);

    res.json({
      success: true,
      data: { 
        channel: {
          ...channel,
          canPost,
          canManageMessages,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/messages
 * Get messages in a channel with pagination
 */
router.get('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { limit = '50', before, after } = req.query;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true, isPrivate: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
      include: {
        memberRoles: {
          include: {
            role: {
              select: { id: true, tier: true },
            },
          },
        },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Check private channel access
    if (channel.isPrivate && membership) {
      const userTier = membership.memberRoles.length 
        ? Math.min(...membership.memberRoles.map(mr => mr.role.tier))
        : 2;
      
      // Admins (tier 0-1) can always access
      if (userTier > 1 && !req.user!.isSuperAdmin) {
        // Check if user has explicit permission
        const hasOverride = await prisma.permissionOverride.findFirst({
          where: {
            channelId: id,
            OR: [
              { userId },
              { roleId: { in: membership.memberRoles.map(mr => mr.role.id) } },
            ],
            allow: { gt: BigInt(0) },
          },
        });

        if (!hasOverride) {
          throw new ForbiddenError('You do not have access to this private channel');
        }
      }
    }

    // Build query — exclude thread replies from the main list
    const take = Math.min(parseInt(limit as string, 10), 100);
    const whereClause: any = { channelId: id, parentMessageId: null };

    if (before) {
      whereClause.createdAt = { lt: new Date(before as string) };
    } else if (after) {
      whereClause.createdAt = { gt: new Date(after as string) };
    }

    const messages = await prisma.message.findMany({
      where: whereClause,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: {
          select: {
            id: true,
            fileName: true,
            fileUrl: true,
            mimeType: true,
            fileSize: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // For messages with replies, fetch the latest 3 unique reply authors
    const messageIds = messages.filter(m => m.replyCount > 0).map(m => m.id);
    let replyAuthorsByParent: Record<string, { id: string; displayName: string; avatarUrl: string | null }[]> = {};
    if (messageIds.length > 0) {
      const recentReplies = await prisma.message.findMany({
        where: { parentMessageId: { in: messageIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          parentMessageId: true,
          author: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      // Group by parent and deduplicate authors, keeping last 3 unique
      for (const reply of recentReplies) {
        const pid = reply.parentMessageId!;
        if (!replyAuthorsByParent[pid]) replyAuthorsByParent[pid] = [];
        const arr = replyAuthorsByParent[pid];
        if (arr.length < 3 && !arr.some(a => a.id === reply.author.id)) {
          arr.push(reply.author);
        }
      }
    }

    // Reverse to get chronological order and format reactions/attachments
    const orderedMessages = messages.reverse().map((msg) => {
      // Group reactions by emoji
      const groupedReactions = msg.reactions.reduce((acc: Record<string, { emoji: string; count: number; users: { id: string; displayName: string }[] }>, r) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push({ id: r.user.id, displayName: r.user.displayName });
        return acc;
      }, {});

      // Add category to attachments
      const attachmentsWithCategory = msg.attachments.map(att => ({
        ...att,
        category: getFileCategory(att.mimeType),
      }));

      return {
        ...msg,
        attachments: attachmentsWithCategory,
        reactions: Object.values(groupedReactions),
        latestReplyAuthors: replyAuthorsByParent[msg.id] || [],
      };
    });

    res.json({
      success: true,
      data: {
        messages: orderedMessages,
        hasMore: messages.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/channels/:id/messages
 * Send a message to a channel
 */
router.post('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { content, parentMessageId } = req.body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    if (content.length > 4000) {
      throw new BadRequestError('Message content cannot exceed 4000 characters');
    }

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true, type: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Permission checks
    const userPerms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);

    // Check SEND_MESSAGES permission
    if (!hasPermission(userPerms, Permissions.SEND_MESSAGES)) {
      throw new ForbiddenError('You do not have permission to send messages');
    }

    // Announcement channels require SEND_IN_ANNOUNCEMENTS
    if (channel.type === 'ANNOUNCEMENT') {
      if (!hasPermission(userPerms, Permissions.SEND_IN_ANNOUNCEMENTS)) {
        throw new ForbiddenError('You do not have permission to post in announcement channels');
      }
    }

    // Parse mentions from content
    let mentionedUsers: string[] = [];
    let mentionedRoles: string[] = [];
    let mentionEveryone = false;

    // Check for @everyone or @here
    if (content.includes('@everyone') || content.includes('@here')) {
      mentionEveryone = true;
    }

    // Parse @mentions by looking up display names in the program
    // Mobile app sends mentions as @DisplayName (with non-breaking spaces for multi-word names)
    const mentionRegex = /@([^\s@]+(?:\u00A0[^\s@]+)*)/g;
    let match;
    const mentionNames: string[] = [];
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionName = match[1].replace(/\u00A0/g, ' '); // Convert non-breaking spaces back to regular spaces
      if (mentionName !== 'everyone' && mentionName !== 'here') {
        mentionNames.push(mentionName);
      }
    }

    // Look up mentioned users and roles by name if we have mentions to resolve
    if (mentionNames.length > 0) {
      // Get all program members to match against
      const programMembers = await prisma.programMembership.findMany({
        where: { programId: channel.programId },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });

      // Get all program roles to match against
      const programRoles = await prisma.role.findMany({
        where: { programId: channel.programId },
        select: { id: true, name: true },
      });

      // Match mentions to users/roles (case-insensitive)
      for (const name of mentionNames) {
        const lowerName = name.toLowerCase();
        
        // Check users first
        const matchedUser = programMembers.find(
          m => m.user.displayName.toLowerCase() === lowerName
        );
        if (matchedUser && !mentionedUsers.includes(matchedUser.user.id)) {
          mentionedUsers.push(matchedUser.user.id);
          continue;
        }

        // Check roles (remove @ prefix if present in role name)
        const matchedRole = programRoles.find(
          r => r.name.toLowerCase() === lowerName || r.name.toLowerCase() === `@${lowerName}`
        );
        if (matchedRole && !mentionedRoles.includes(matchedRole.id)) {
          mentionedRoles.push(matchedRole.id);
        }
      }
    }

    // Validate parent message for thread replies
    if (parentMessageId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: parentMessageId },
        select: { id: true, channelId: true, parentMessageId: true },
      });
      if (!parentMessage) {
        throw new NotFoundError('Parent message not found');
      }
      if (parentMessage.channelId !== id) {
        throw new BadRequestError('Parent message does not belong to this channel');
      }
      if (parentMessage.parentMessageId) {
        throw new BadRequestError('Cannot reply to a thread reply — reply to the parent message instead');
      }
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        authorId: userId,
        channelId: id,
        content: content.trim(),
        mentionedUsers,
        mentionedRoles,
        mentionEveryone,
        parentMessageId: parentMessageId || null,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
      },
    });

    // Update parent message thread metadata
    if (parentMessageId) {
      await prisma.message.update({
        where: { id: parentMessageId },
        data: {
          replyCount: { increment: 1 },
          lastReplyAt: new Date(),
        },
      });
    }

    // Increment mention counts for mentioned users
    if (mentionedUsers.length > 0 || mentionedRoles.length > 0 || mentionEveryone) {
      // Get users to notify based on mentions
      let usersToNotify: string[] = [...mentionedUsers];

      // If mentionEveryone, get all program members
      if (mentionEveryone) {
        const memberships = await prisma.programMembership.findMany({
          where: { programId: channel.programId },
          select: { userId: true },
        });
        usersToNotify = memberships.map(m => m.userId);
      }

      // If roles mentioned, get users with those roles
      if (mentionedRoles.length > 0) {
        const memberRoles = await prisma.memberRole.findMany({
          where: {
            roleId: { in: mentionedRoles },
            membership: { programId: channel.programId },
          },
          include: {
            membership: { select: { userId: true } },
          },
        });
        const roleUsers = memberRoles.map(mr => mr.membership.userId);
        usersToNotify = [...new Set([...usersToNotify, ...roleUsers])];
      }

      // Remove the author from the list
      usersToNotify = usersToNotify.filter(uid => uid !== userId);

      // Increment mention counts for all notified users using batch operations
      if (usersToNotify.length > 0) {
        // First, get existing channel read records
        const existingReads = await prisma.channelRead.findMany({
          where: {
            channelId: id,
            userId: { in: usersToNotify },
          },
          select: { userId: true },
        });
        const existingUserIds = new Set(existingReads.map(r => r.userId));

        // Batch increment existing records
        if (existingUserIds.size > 0) {
          await prisma.channelRead.updateMany({
            where: {
              channelId: id,
              userId: { in: Array.from(existingUserIds) },
            },
            data: {
              mentionCount: { increment: 1 },
            },
          });
        }

        // Batch create new records for users without existing entries
        const newUserIds = usersToNotify.filter(uid => !existingUserIds.has(uid));
        if (newUserIds.length > 0) {
          await prisma.channelRead.createMany({
            data: newUserIds.map(uid => ({
              userId: uid,
              channelId: id,
              lastReadAt: new Date(0), // Never read
              mentionCount: 1,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    // Emit real-time events
    const io = req.app.get('io');
    if (io) {
      // 1. Emit new message to users currently in the channel
      io.to(`channel:${id}`).emit('new_message', { ...message, parentMessageId: message.parentMessageId || null });
      
      // 1b. If this is a thread reply, emit thread metadata update for the parent message
      if (parentMessageId) {
        const updatedParent = await prisma.message.findUnique({
          where: { id: parentMessageId },
          select: { replyCount: true, lastReplyAt: true },
        });
        // Fetch latest 3 unique reply authors for the thread indicator
        const recentReplies = await prisma.message.findMany({
          where: { parentMessageId },
          orderBy: { createdAt: 'desc' },
          select: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
        });
        const uniqueAuthors: { id: string; displayName: string; avatarUrl: string | null }[] = [];
        for (const r of recentReplies) {
          if (uniqueAuthors.length >= 3) break;
          if (!uniqueAuthors.some(a => a.id === r.author.id)) uniqueAuthors.push(r.author);
        }
        io.to(`channel:${id}`).emit('thread:reply_added', {
          parentMessageId,
          replyCount: updatedParent?.replyCount || 0,
          lastReplyAt: updatedParent?.lastReplyAt,
          latestReplyAuthors: uniqueAuthors,
        });
      }

      // 2. Emit unread notification to all program members NOT in the channel
      // Get all sockets in the channel room to exclude them
      const channelRoom = io.sockets.adapter.rooms.get(`channel:${id}`);
      const socketsInChannel = channelRoom ? Array.from(channelRoom) : [];
      
      // Emit to program room - clients will filter based on whether they're in the channel
      io.to(`program:${channel.programId}`).emit('unread:channel', {
        channelId: id,
        programId: channel.programId,
        authorId: userId,
        // Clients in the channel should ignore this event
        excludeSocketIds: socketsInChannel,
      });
      
      // 3. Emit mention notifications to specific users
      if (mentionedUsers.length > 0 || mentionedRoles.length > 0 || mentionEveryone) {
        // Get users to notify (already calculated above)
        let usersWithMentions = [...mentionedUsers];
        if (mentionEveryone) {
          const memberships = await prisma.programMembership.findMany({
            where: { programId: channel.programId },
            select: { userId: true },
          });
          usersWithMentions = memberships.map(m => m.userId);
        }
        if (mentionedRoles.length > 0) {
          const memberRoles = await prisma.memberRole.findMany({
            where: {
              roleId: { in: mentionedRoles },
              membership: { programId: channel.programId },
            },
            include: {
              membership: { select: { userId: true } },
            },
          });
          const roleUsers = memberRoles.map(mr => mr.membership.userId);
          usersWithMentions = [...new Set([...usersWithMentions, ...roleUsers])];
        }
        usersWithMentions = usersWithMentions.filter(uid => uid !== userId);
        
        // Emit mention event to program room with list of mentioned users
        if (usersWithMentions.length > 0) {
          io.to(`program:${channel.programId}`).emit('unread:mention', {
            channelId: id,
            programId: channel.programId,
            mentionedUserIds: usersWithMentions,
            excludeSocketIds: socketsInChannel,
          });
        }
      }
    }

    // ── Push Notifications (fire-and-forget) ──
    (async () => {
      try {
        // Get channel + program names for notification text
        const channelDetail = await prisma.channel.findUnique({
          where: { id },
          select: {
            name: true,
            programId: true,
            program: { select: { name: true } },
          },
        });
        if (!channelDetail) return;

        const authorName = message.author.displayName;
        const channelName = channelDetail.name;
        const programName = channelDetail.program.name;

        // Get all program members (excluding author)
        const allMemberships = await prisma.programMembership.findMany({
          where: { programId: channelDetail.programId },
          select: { userId: true },
        });
        const allMemberIds = allMemberships
          .map(m => m.userId)
          .filter(uid => uid !== userId);

        if (allMemberIds.length === 0) return;

        // Get muted channel users (so we can exclude them)
        const mutedRecords = await prisma.channelRead.findMany({
          where: {
            channelId: id,
            userId: { in: allMemberIds },
            isMuted: true,
          },
          select: { userId: true },
        });
        const mutedUserIds = new Set(mutedRecords.map(r => r.userId));

        // Split users: mentioned vs non-mentioned
        // Mentioned users already calculated above (usersToNotify from mention section)
        let mentionedUserIdsFinal: string[] = [];
        if (mentionedUsers.length > 0 || mentionedRoles.length > 0 || mentionEveryone) {
          mentionedUserIdsFinal = [...mentionedUsers];
          if (mentionEveryone) {
            mentionedUserIdsFinal = allMemberIds;
          }
          if (mentionedRoles.length > 0) {
            const memberRolesForPush = await prisma.memberRole.findMany({
              where: {
                roleId: { in: mentionedRoles },
                membership: { programId: channelDetail.programId },
              },
              include: { membership: { select: { userId: true } } },
            });
            const roleUserIds = memberRolesForPush.map(mr => mr.membership.userId);
            mentionedUserIdsFinal = [...new Set([...mentionedUserIdsFinal, ...roleUserIds])];
          }
          mentionedUserIdsFinal = mentionedUserIdsFinal.filter(uid => uid !== userId);
        }

        const mentionedSet = new Set(mentionedUserIdsFinal);

        // 1. Send mention push notifications (not muted)
        const mentionTargets = mentionedUserIdsFinal.filter(uid => !mutedUserIds.has(uid));
        if (mentionTargets.length > 0) {
          const mentionType = mentionEveryone ? 'everyone' : (mentionedRoles.length > 0 ? 'role' : 'user');
          await sendPushToUsers(mentionTargets, buildMentionNotification({
            authorName,
            channelName,
            programName,
            messagePreview: content.trim(),
            channelId: id,
            programId: channelDetail.programId,
            mentionType,
          }));
        }

        // 2. Send channel message push to non-mentioned, non-muted members
        const channelMsgTargets = allMemberIds.filter(
          uid => !mentionedSet.has(uid) && !mutedUserIds.has(uid)
        );
        if (channelMsgTargets.length > 0) {
          await sendPushToUsers(channelMsgTargets, buildChannelMessageNotification({
            authorName,
            channelName,
            programName,
            messagePreview: content.trim(),
            channelId: id,
            programId: channelDetail.programId,
          }));
        }
      } catch (pushError) {
        console.error('[Push] Channel message push failed:', pushError);
      }
    })();

    res.status(201).json({
      success: true,
      data: { message },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/channels/:channelId/messages/:messageId
 * Edit a message
 */
router.patch('/:channelId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Message content is required');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new BadRequestError('Message does not belong to this channel');
    }

    // Only author can edit their message
    if (message.authorId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You can only edit your own messages');
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        isEdited: true,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    // Group reactions by emoji for client format
    const groupedReactions = updatedMessage.reactions.reduce((acc: any[], reaction: any) => {
      const existing = acc.find(r => r.emoji === reaction.emoji);
      if (existing) {
        existing.count++;
        existing.users.push(reaction.user);
      } else {
        acc.push({
          emoji: reaction.emoji,
          count: 1,
          users: [reaction.user],
        });
      }
      return acc;
    }, []);

    const messageWithGroupedReactions = {
      ...updatedMessage,
      reactions: groupedReactions,
    };

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_updated', messageWithGroupedReactions);
    }

    res.json({
      success: true,
      data: { message: messageWithGroupedReactions },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/channels/:channelId/messages/:messageId
 * Delete a message
 */
router.delete('/:channelId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, parentMessageId: true },
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    if (message.channelId !== channelId) {
      throw new BadRequestError('Message does not belong to this channel');
    }

    // Author can always delete their own; otherwise check MANAGE_MESSAGES permission
    if (message.authorId !== userId) {
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { programId: true },
      });
      if (!channel) throw new NotFoundError('Channel not found');

      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to delete this message');
      }
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // If this was a thread reply, decrement parent's replyCount
    if (message.parentMessageId) {
      const updatedParent = await prisma.message.update({
        where: { id: message.parentMessageId },
        data: { replyCount: { decrement: 1 } },
        select: { replyCount: true, lastReplyAt: true },
      });
      // Fetch latest reply authors for the updated indicator
      const recentReplies = await prisma.message.findMany({
        where: { parentMessageId: message.parentMessageId },
        orderBy: { createdAt: 'desc' },
        select: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      });
      const uniqueAuthors: { id: string; displayName: string; avatarUrl: string | null }[] = [];
      for (const r of recentReplies) {
        if (uniqueAuthors.length >= 3) break;
        if (!uniqueAuthors.some(a => a.id === r.author.id)) uniqueAuthors.push(r.author);
      }

      const io2 = req.app.get('io');
      if (io2) {
        io2.to(`channel:${channelId}`).emit('thread:reply_added', {
          parentMessageId: message.parentMessageId,
          replyCount: Math.max(0, updatedParent.replyCount),
          lastReplyAt: updatedParent.lastReplyAt,
          latestReplyAuthors: uniqueAuthors,
        });
      }
    }

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_deleted', { messageId, channelId, parentMessageId: message.parentMessageId });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// THREAD REPLIES
// ============================================

/**
 * GET /api/channels/messages/:messageId/thread
 * Get all replies for a parent message (paginated, chronological)
 */
router.get('/messages/:messageId/thread', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.params;
    const userId = req.user!.id;
    const { limit = '50', before } = req.query;

    // Find the parent message
    const parentMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: {
          select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true },
        },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    if (!parentMessage) {
      throw new NotFoundError('Message not found');
    }

    if (!parentMessage.channelId) {
      throw new BadRequestError('Message does not belong to a channel');
    }

    // Verify channel membership
    const channel = await prisma.channel.findUnique({
      where: { id: parentMessage.channelId },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Fetch thread replies
    const take = Math.min(parseInt(limit as string, 10), 100);
    const whereClause: any = { parentMessageId: messageId };
    if (before) {
      whereClause.createdAt = { lt: new Date(before as string) };
    }

    const replies = await prisma.message.findMany({
      where: whereClause,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: {
          select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true },
        },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    // Format reactions helper
    const formatReactions = (reactions: any[]) => {
      const grouped = reactions.reduce((acc: Record<string, any>, r: any) => {
        if (!acc[r.emoji]) {
          acc[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        }
        acc[r.emoji].count++;
        acc[r.emoji].users.push({ id: r.user.id, displayName: r.user.displayName });
        return acc;
      }, {});
      return Object.values(grouped);
    };

    // Format parent message
    const parentFormatted = {
      ...parentMessage,
      attachments: parentMessage.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(parentMessage.reactions),
    };

    // Format replies (chronological)
    const formattedReplies = replies.reverse().map(reply => ({
      ...reply,
      attachments: reply.attachments.map((att: any) => ({ ...att, category: getFileCategory(att.mimeType) })),
      reactions: formatReactions(reply.reactions),
    }));

    res.json({
      success: true,
      data: {
        parentMessage: parentFormatted,
        replies: formattedReplies,
        hasMore: replies.length === take,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CHANNEL READ STATUS
// ============================================

/**
 * POST /api/channels/:id/read
 * Mark channel as read
 */
router.post('/:id/read', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { lastReadMessageId } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Upsert the channel read status
    await prisma.channelRead.upsert({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      create: {
        userId,
        channelId: id,
        lastReadAt: new Date(),
        lastReadMessageId: lastReadMessageId || null,
        mentionCount: 0,
      },
      update: {
        lastReadAt: new Date(),
        lastReadMessageId: lastReadMessageId || null,
        mentionCount: 0, // Reset mention count when marking as read
      },
    });

    res.json({
      success: true,
      message: 'Channel marked as read',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/unread
 * Get unread status for a channel
 */
router.get('/:id/unread', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Get the user's last read status
    const channelRead = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
    });

    // Count unread messages since lastReadAt
    const lastReadAt = channelRead?.lastReadAt || new Date(0);
    
    const unreadCount = await prisma.message.count({
      where: {
        channelId: id,
        createdAt: { gt: lastReadAt },
        authorId: { not: userId }, // Don't count own messages as unread
      },
    });

    res.json({
      success: true,
      data: {
        channelId: id,
        unreadCount,
        mentionCount: channelRead?.mentionCount || 0,
        lastReadAt: channelRead?.lastReadAt || null,
        isMuted: channelRead?.isMuted ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CHANNEL MUTE
// ============================================

/**
 * POST /api/channels/:id/mute
 * Toggle mute status for a channel. If body includes { muted: true/false },
 * sets explicitly; otherwise toggles current state.
 */
router.post('/:id/mute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { muted } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id },
      select: { id: true, programId: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: channel.programId },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // Get or create channel read record
    const existing = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
    });

    const newMuted = typeof muted === 'boolean' ? muted : !(existing?.isMuted ?? false);

    await prisma.channelRead.upsert({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      create: {
        userId,
        channelId: id,
        lastReadAt: new Date(),
        isMuted: newMuted,
      },
      update: {
        isMuted: newMuted,
      },
    });

    res.json({
      success: true,
      data: { channelId: id, isMuted: newMuted },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:id/mute
 * Get mute status for a channel
 */
router.get('/:id/mute', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const channelRead = await prisma.channelRead.findUnique({
      where: {
        userId_channelId: { userId, channelId: id },
      },
      select: { isMuted: true },
    });

    res.json({
      success: true,
      data: { channelId: id, isMuted: channelRead?.isMuted ?? false },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// MESSAGE PINNING
// ============================================

// getUserPermissions is imported from ../utils/roleHelpers

/**
 * POST /api/channels/:channelId/messages/:messageId/pin
 * Pin a message in a channel.
 * Requires: message author OR MANAGE_MESSAGES permission.
 */
router.post('/:channelId/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    // Verify message exists in this channel
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, isPinned: true, parentMessageId: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.channelId !== channelId) throw new BadRequestError('Message does not belong to this channel');
    if (message.parentMessageId) throw new BadRequestError('Thread replies cannot be pinned');
    if (message.isPinned) {
      return res.json({ success: true, message: 'Message is already pinned' });
    }

    // Verify channel and program membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    // Permission check: author or MANAGE_MESSAGES
    if (message.authorId !== userId) {
      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to pin this message');
      }
    }

    // Pin the message
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true } },
      },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_pinned', {
        channelId,
        message: updated,
        pinnedBy: { id: userId, displayName: req.user!.displayName },
      });
    }

    res.json({ success: true, data: { message: updated } });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/channels/:channelId/messages/:messageId/pin
 * Unpin a message in a channel.
 * Requires: message author OR MANAGE_MESSAGES permission.
 */
router.delete('/:channelId/messages/:messageId/pin', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, messageId } = req.params;
    const userId = req.user!.id;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, authorId: true, channelId: true, isPinned: true },
    });

    if (!message) throw new NotFoundError('Message not found');
    if (message.channelId !== channelId) throw new BadRequestError('Message does not belong to this channel');
    if (!message.isPinned) {
      return res.json({ success: true, message: 'Message is not pinned' });
    }

    // Verify channel and program membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    // Permission check: author or MANAGE_MESSAGES
    if (message.authorId !== userId) {
      const perms = await getUserPermissions(userId, channel.programId, req.user!.isSuperAdmin);
      if (!hasPermission(perms, Permissions.MANAGE_MESSAGES)) {
        throw new ForbiddenError('You do not have permission to unpin this message');
      }
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: false },
    });

    // Emit real-time event
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message_unpinned', {
        channelId,
        messageId,
        unpinnedBy: { id: userId, displayName: req.user!.displayName },
      });
    }

    res.json({ success: true, message: 'Message unpinned' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/channels/:channelId/pinned
 * Get all pinned messages in a channel (newest pin first).
 */
router.get('/:channelId/pinned', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId } = req.params;
    const userId = req.user!.id;

    // Verify channel and membership
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, programId: true },
    });
    if (!channel) throw new NotFoundError('Channel not found');

    const isMember = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: channel.programId } },
    });
    if (!isMember && !req.user!.isSuperAdmin) throw new ForbiddenError('You are not a member of this program');

    const pinnedMessages = await prisma.message.findMany({
      where: { channelId, isPinned: true },
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        attachments: { select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSize: true } },
        reactions: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    // Group reactions
    const formatted = pinnedMessages.map(msg => {
      const reactionMap = new Map<string, { emoji: string; count: number; users: { id: string; displayName: string }[] }>();
      for (const r of msg.reactions) {
        const existing = reactionMap.get(r.emoji);
        if (existing) {
          existing.count++;
          existing.users.push(r.user);
        } else {
          reactionMap.set(r.emoji, { emoji: r.emoji, count: 1, users: [r.user] });
        }
      }
      const { reactions, ...rest } = msg;
      return {
        ...rest,
        createdAt: msg.createdAt.toISOString(),
        updatedAt: msg.updatedAt.toISOString(),
        reactions: Array.from(reactionMap.values()),
      };
    });

    res.json({ success: true, data: { messages: formatted, count: formatted.length } });
  } catch (error) {
    next(error);
  }
});

export default router;
