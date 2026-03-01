import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { Permissions, PermissionPresets, hasPermission } from '../utils/permissions';
import { getUserPermissions } from '../utils/roleHelpers';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { sendPushToUsers, buildProgramInviteNotification } from '../services/pushNotification';

const router = Router();

// Helper to generate a short, readable invite code
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * GET /api/programs
 * List user's programs
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.programMembership.findMany({
      where: { userId },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
            isDefault: true,
            isPrivate: true,
            status: true,
            ownerId: true,
            _count: {
              select: { memberships: true, channels: true },
            },
          },
        },
        memberRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        program: {
          isDefault: 'desc', // Default program first
        },
      },
    });

    // Filter programs: show archived only if user is the owner or super admin
    const programs = memberships
      .filter(m => {
        const isArchived = m.program.status === 'ARCHIVED';
        const isOwner = m.program.ownerId === userId;
        const isSuperAdmin = req.user!.isSuperAdmin;
        
        // Show all non-archived programs
        if (!isArchived) return true;
        // For archived programs, only show to owner or super admin
        return isOwner || isSuperAdmin;
      })
      .map(m => ({
        id: m.program.id,
        name: m.program.name,
        description: m.program.description,
        iconUrl: m.program.iconUrl,
        isDefault: m.program.isDefault,
        status: m.program.status,
        isPrivate: m.program.isPrivate,
        memberCount: m.program._count.memberships,
        channelCount: m.program._count.channels,
        nickname: m.nickname,
        roles: m.memberRoles.map(mr => mr.role),
        joinedAt: m.joinedAt,
        isOwner: m.program.ownerId === userId,
      }));

    res.json({
      success: true,
      data: { programs },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/default
 * Get the default program
 */
router.get('/default', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const program = await prisma.program.findFirst({
      where: { isDefault: true },
      include: {
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!program) {
      throw new NotFoundError('Default program not found');
    }

    res.json({
      success: true,
      data: { program },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs
 * Create a new program
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { name, description, iconUrl, isPrivate, startDate, endDate } = req.body;

    if (!name) {
      throw new BadRequestError('Program name is required');
    }

    if (name.length > 100) {
      throw new BadRequestError('Program name cannot exceed 100 characters');
    }

    // Create program with default roles and channels
    const program = await prisma.$transaction(async (tx) => {
      // Create program
      const newProgram = await tx.program.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          iconUrl: iconUrl || null,
          isPrivate: isPrivate || false,
          ownerId: userId,
          inviteCode: generateInviteCode(),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });

      // Create @everyone role
      const everyoneRole = await tx.role.create({
        data: {
          programId: newProgram.id,
          name: '@everyone',
          permissions: PermissionPresets.EVERYONE,
          isEveryone: true,
        },
      });

      // Create owner membership
      const membership = await tx.programMembership.create({
        data: {
          userId,
          programId: newProgram.id,
        },
      });

      // Assign @everyone role to owner
      await tx.memberRole.create({
        data: {
          membershipId: membership.id,
          roleId: everyoneRole.id,
        },
      });

      // Create default categories
      const welcomeCategory = await tx.category.create({
        data: {
          programId: newProgram.id,
          name: 'WELCOME',
          position: 0,
        },
      });

      const discussionCategory = await tx.category.create({
        data: {
          programId: newProgram.id,
          name: 'DISCUSSION',
          position: 1,
        },
      });

      // Create default channels
      await tx.channel.createMany({
        data: [
          {
            programId: newProgram.id,
            categoryId: welcomeCategory.id,
            name: 'announcements',
            type: 'ANNOUNCEMENT',
            position: 0,
            createdById: userId,
          },
          {
            programId: newProgram.id,
            categoryId: welcomeCategory.id,
            name: 'introductions',
            type: 'TEXT',
            position: 1,
            createdById: userId,
          },
          {
            programId: newProgram.id,
            categoryId: discussionCategory.id,
            name: 'general',
            type: 'TEXT',
            position: 0,
            isProtected: true, // Cannot be deleted
            createdById: userId,
          },
          {
            programId: newProgram.id,
            categoryId: discussionCategory.id,
            name: 'resources',
            type: 'TEXT',
            position: 1,
            createdById: userId,
          },
        ],
      });

      return newProgram;
    });

    res.status(201).json({
      success: true,
      data: { program },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id
 * Get program details with categories and channels
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // First check if program exists and get basic info
    const programBasic = await prisma.program.findUnique({
      where: { id },
      select: { status: true, ownerId: true },
    });

    if (!programBasic) {
      throw new NotFoundError('Program not found');
    }

    // Check membership and get user's roles
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: id },
      },
      include: {
        memberRoles: {
          include: {
            role: { select: { id: true, tier: true } },
          },
        },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    // If program is archived, only allow owner or super admin to view
    const isOwnerOrAdmin = programBasic.ownerId === userId || req.user!.isSuperAdmin;
    if (programBasic.status === 'ARCHIVED' && !isOwnerOrAdmin) {
      throw new ForbiddenError('This program has been archived');
    }

    // Get user's tier (lowest tier = highest authority)
    const userTier = membership?.memberRoles.length
      ? Math.min(...membership.memberRoles.map(mr => mr.role.tier))
      : 3;
    const userRoleIds = membership?.memberRoles.map(mr => mr.role.id) || [];
    
    // Admins (tier 0-1) and super admins can see all channels
    const canSeeAllPrivate = userTier <= 1 || req.user!.isSuperAdmin;

    // Get private channels the user has explicit access to
    let accessiblePrivateChannelIds: string[] = [];
    if (!canSeeAllPrivate) {
      const permissionOverrides = await prisma.permissionOverride.findMany({
        where: {
          channel: { programId: id },
          OR: [
            { userId },
            { roleId: { in: userRoleIds } },
          ],
          allow: { gt: BigInt(0) },
        },
        select: { channelId: true },
      });
      accessiblePrivateChannelIds = permissionOverrides
        .filter(p => p.channelId)
        .map(p => p.channelId as string);
    }

    // Get program with all related data
    const program = await prisma.program.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        categories: {
          orderBy: { position: 'asc' },
          include: {
            channels: {
              where: { isArchived: false },
              orderBy: { position: 'asc' },
              select: {
                id: true,
                name: true,
                topic: true,
                type: true,
                position: true,
                isPrivate: true,
                isProtected: true,
              },
            },
          },
        },
        channels: {
          where: { 
            isArchived: false,
            categoryId: null, // Uncategorized channels
          },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            topic: true,
            type: true,
            position: true,
            isPrivate: true,
            isProtected: true,
          },
        },
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Filter private channels based on user access
    const filterChannels = (channels: any[]) => {
      return channels.filter(ch => {
        // Public channels are always visible
        if (!ch.isPrivate) return true;
        // Admins and super admins see all private channels
        if (canSeeAllPrivate) return true;
        // Check if user has explicit access
        return accessiblePrivateChannelIds.includes(ch.id);
      });
    };

    // Get all channel IDs to fetch unread data
    const allChannelIds = [
      ...program.categories.flatMap(c => c.channels.map(ch => ch.id)),
      ...program.channels.map(ch => ch.id),
    ];

    // Fetch unread data for all channels at once
    const channelReads = await prisma.channelRead.findMany({
      where: {
        userId,
        channelId: { in: allChannelIds },
      },
    });

    // Create a map for quick lookup
    const channelReadMap = new Map(
      channelReads.map(cr => [cr.channelId, cr])
    );

    // Get last message timestamps for each channel (excluding user's own messages)
    const lastMessages = await prisma.message.groupBy({
      by: ['channelId'],
      where: {
        channelId: { in: allChannelIds, not: null },
        authorId: { not: userId }, // Exclude user's own messages
      },
      _max: {
        createdAt: true,
      },
    });

    const lastMessageMap = new Map(
      lastMessages
        .filter(lm => lm.channelId !== null)
        .map(lm => [lm.channelId as string, lm._max.createdAt])
    );

    // Add unread data to channels
    const addUnreadData = (channels: any[]) => {
      return channels.map(ch => {
        const channelRead = channelReadMap.get(ch.id);
        const lastMessageAt = lastMessageMap.get(ch.id);
        const lastReadAt = channelRead?.lastReadAt;

        // Calculate if there are unread messages (from other users)
        const hasUnread = lastMessageAt && (!lastReadAt || lastMessageAt > lastReadAt);

        return {
          ...ch,
          hasUnread: !!hasUnread,
          mentionCount: channelRead?.mentionCount || 0,
          isMuted: channelRead?.isMuted ?? false,
        };
      });
    };

    // Filter channels in categories and add unread data
    const filteredCategories = program.categories.map(category => ({
      ...category,
      channels: addUnreadData(filterChannels(category.channels)),
    }));

    // Filter uncategorized channels and add unread data
    const filteredUncategorizedChannels = addUnreadData(filterChannels(program.channels));

    res.json({
      success: true,
      data: { 
        program: {
          ...program,
          categories: filteredCategories,
          channels: filteredUncategorizedChannels,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/programs/:id
 * Update program
 */
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { name, description, iconUrl, status } = req.body;

    // Check if user is owner or super admin
    const program = await prisma.program.findUnique({
      where: { id },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can update this program');
    }

    const updatedProgram = await prisma.program.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(iconUrl !== undefined && { iconUrl }),
        ...(status && { status }),
      },
    });

    // Emit program:updated event to all members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${id}`).emit('program:updated', {
        programId: id,
        name: updatedProgram.name,
        description: updatedProgram.description,
        iconUrl: updatedProgram.iconUrl,
        isPrivate: updatedProgram.isPrivate,
      });
    }

    res.json({
      success: true,
      data: { program: updatedProgram },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/programs/:id
 * Permanently delete program
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true, isDefault: true },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Cannot delete default program
    if (program.isDefault) {
      throw new BadRequestError('Cannot delete the default program');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can delete this program');
    }

    // Emit program:deleted event BEFORE deleting (so room still exists)
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${id}`).emit('program:deleted', {
        programId: id,
      });
    }

    // Permanently delete the program (cascade will handle related data)
    await prisma.program.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Program deleted permanently',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/join
 * Join program via invite code
 */
router.post('/join', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { inviteCode, message } = req.body;

    if (!inviteCode) {
      throw new BadRequestError('Invite code is required');
    }

    // Find program by invite code
    const program = await prisma.program.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: {
        roles: {
          where: { isEveryone: true },
        },
        _count: { select: { memberships: true } },
      },
    });

    if (!program) {
      throw new NotFoundError('Invalid invite code');
    }

    if (program.status === 'ARCHIVED') {
      throw new BadRequestError('This program is no longer active');
    }

    // Check if already a member
    const existingMembership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: program.id },
      },
    });

    if (existingMembership) {
      throw new BadRequestError('You are already a member of this program');
    }

    // For private programs, create a join request instead of joining directly
    if (program.isPrivate) {
      // Check if there's already a pending request
      const existingRequest = await prisma.joinRequest.findUnique({
        where: { programId_userId: { programId: program.id, userId } },
      });

      if (existingRequest) {
        if (existingRequest.status === 'PENDING') {
          throw new BadRequestError('You already have a pending join request for this program');
        }
        if (existingRequest.status === 'REJECTED') {
          // Allow re-requesting after rejection
          await prisma.joinRequest.update({
            where: { id: existingRequest.id },
            data: {
              status: 'PENDING',
              message: message || null,
              reviewedById: null,
              reviewedAt: null,
            },
          });

          return res.status(202).json({
            success: true,
            message: 'Join request submitted. Waiting for approval.',
            data: { 
              status: 'PENDING',
              programName: program.name,
              isPrivate: true,
            },
          });
        }
      }

      const joinRequest = await prisma.joinRequest.create({
        data: {
          programId: program.id,
          userId,
          message: message || null,
        },
      });

      return res.status(202).json({
        success: true,
        message: 'Join request submitted. Waiting for approval.',
        data: { 
          requestId: joinRequest.id,
          status: 'PENDING',
          programName: program.name,
          isPrivate: true,
        },
      });
    }

    // For public programs, join directly
    const membership = await prisma.programMembership.create({
      data: {
        userId,
        programId: program.id,
      },
    });

    // Assign @everyone role
    const everyoneRole = program.roles[0];
    if (everyoneRole) {
      await prisma.memberRole.create({
        data: {
          membershipId: membership.id,
          roleId: everyoneRole.id,
        },
      });
    }

    // Get full member data for socket event
    const newMember = await prisma.programMembership.findUnique({
      where: { id: membership.id },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        memberRoles: { include: { role: true } },
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io && newMember) {
      io.to(`program:${program.id}`).emit('member:joined', {
        programId: program.id,
        member: {
          id: newMember.id,
          userId: newMember.user.id,
          displayName: newMember.user.displayName,
          avatarUrl: newMember.user.avatarUrl,
          nickname: newMember.nickname,
          roles: newMember.memberRoles.map(mr => ({
            id: mr.role.id,
            name: mr.role.name,
            color: mr.role.color,
            tier: mr.role.tier,
          })),
          joinedAt: newMember.joinedAt.toISOString(),
        },
      });
    }

    res.json({
      success: true,
      message: 'Successfully joined program',
      data: {
        program: {
          id: program.id,
          name: program.name,
          iconUrl: program.iconUrl,
          memberCount: program._count.memberships + 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id/members
 * Get all members of a program
 */
router.get('/:id/members', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: id },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    const memberships = await prisma.programMembership.findMany({
      where: { programId: id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            isOnline: true,
            lastSeenAt: true,
            isSuperAdmin: true,
          },
        },
        memberRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                color: true,
                isHoisted: true,
              },
            },
          },
        },
      },
      orderBy: {
        joinedAt: 'asc',
      },
    });

    // Get the program to check owner
    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    const members = memberships.map(m => ({
      id: m.id,
      userId: m.user.id,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      isOnline: m.user.isOnline,
      lastSeenAt: m.user.lastSeenAt,
      isSuperAdmin: m.user.isSuperAdmin,
      isOwner: program?.ownerId === m.user.id,
      nickname: m.nickname,
      roles: m.memberRoles.map(mr => mr.role),
      joinedAt: m.joinedAt,
    }));

    // Sort by name (role hierarchy handled by tier on frontend)
    members.sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json({
      success: true,
      data: { members },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id/members/:memberId
 * Get a specific member's profile in a program
 */
router.get('/:id/members/:memberId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, memberId } = req.params;
    const userId = req.user!.id;

    // Check membership
    const myMembership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: id },
      },
    });

    if (!myMembership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            isOnline: true,
            lastSeenAt: true,
            isSuperAdmin: true,
            createdAt: true,
            bio: true,
            bannerColor: true,
            statusEmoji: true,
            statusText: true,
            statusExpiresAt: true,
          },
        },
        memberRoles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!membership || membership.programId !== id) {
      throw new NotFoundError('Member not found in this program');
    }

    // Get the program to check owner
    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    const member = {
      id: membership.id,
      userId: membership.user.id,
      displayName: membership.user.displayName,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      isOnline: membership.user.isOnline,
      lastSeenAt: membership.user.lastSeenAt,
      isSuperAdmin: membership.user.isSuperAdmin,
      isOwner: program?.ownerId === membership.user.id,
      accountCreatedAt: membership.user.createdAt,
      nickname: membership.nickname,
      roles: membership.memberRoles.map(mr => mr.role),
      joinedAt: membership.joinedAt,
      bio: membership.user.bio,
      bannerColor: membership.user.bannerColor,
      statusEmoji: membership.user.statusEmoji,
      statusText: membership.user.statusText,
      statusExpiresAt: membership.user.statusExpiresAt,
    };

    res.json({
      success: true,
      data: { member },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id/members/by-user/:userId
 * Look up a program member by their user ID (instead of membership ID)
 */
router.get('/:id/members/by-user/:userId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const requesterId = req.user!.id;

    // Check requester is a member
    const myMembership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId: requesterId, programId: id } },
    });
    if (!myMembership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId: targetUserId, programId: id } },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            isOnline: true,
            lastSeenAt: true,
            isSuperAdmin: true,
            createdAt: true,
            bio: true,
            bannerColor: true,
            statusEmoji: true,
            statusText: true,
            statusExpiresAt: true,
          },
        },
        memberRoles: {
          include: {
            role: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundError('User is not a member of this program');
    }

    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true },
    });

    const member = {
      id: membership.id,
      userId: membership.user.id,
      displayName: membership.user.displayName,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      isOnline: membership.user.isOnline,
      lastSeenAt: membership.user.lastSeenAt,
      isSuperAdmin: membership.user.isSuperAdmin,
      isOwner: program?.ownerId === membership.user.id,
      accountCreatedAt: membership.user.createdAt,
      nickname: membership.nickname,
      roles: membership.memberRoles.map(mr => mr.role),
      joinedAt: membership.joinedAt,
      bio: membership.user.bio,
      bannerColor: membership.user.bannerColor,
      statusEmoji: membership.user.statusEmoji,
      statusText: membership.user.statusText,
      statusExpiresAt: membership.user.statusExpiresAt,
    };

    res.json({ success: true, data: { member } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/:id/invite/regenerate
 * Regenerate invite code
 */
router.post('/:id/invite/regenerate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const userPerms = await getUserPermissions(userId, id, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.INVITE_MEMBERS)) {
      throw new ForbiddenError('You do not have permission to manage invites');
    }

    const newInviteCode = generateInviteCode();

    const program = await prisma.program.update({
      where: { id },
      data: { inviteCode: newInviteCode },
      select: { id: true, inviteCode: true, name: true },
    });

    res.json({
      success: true,
      data: { inviteCode: program.inviteCode },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id/invite-code
 * Get program invite code (for sharing)
 */
router.get('/:id/invite-code', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if user is a member
    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId: id } },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You must be a member to get the invite code');
    }

    const program = await prisma.program.findUnique({
      where: { id },
      select: { inviteCode: true, name: true, isPrivate: true },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    res.json({
      success: true,
      data: {
        inviteCode: program.inviteCode,
        programName: program.name,
        isPrivate: program.isPrivate,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/programs/:id/join-requests
 * Get pending join requests (for admins)
 */
router.get('/:id/join-requests', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const userPerms = await getUserPermissions(userId, id, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.INVITE_MEMBERS)) {
      throw new ForbiddenError('You do not have permission to manage join requests');
    }

    const requests = await prisma.joinRequest.findMany({
      where: { programId: id, status: 'PENDING' },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: { requests },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/:id/join-requests/:requestId/approve
 * Approve a join request
 */
router.post('/:id/join-requests/:requestId/approve', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, requestId } = req.params;
    const userId = req.user!.id;

    const userPerms = await getUserPermissions(userId, id, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.INVITE_MEMBERS)) {
      throw new ForbiddenError('You do not have permission to manage join requests');
    }

    const request = await prisma.joinRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { displayName: true } } },
    });

    if (!request || request.programId !== id) {
      throw new NotFoundError('Join request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestError('This request has already been processed');
    }

    // Update request status
    await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });

    // Add user to program
    const everyoneRole = await prisma.role.findFirst({
      where: { programId: id, isEveryone: true },
    });

    const membership = await prisma.programMembership.create({
      data: {
        userId: request.userId,
        programId: id,
      },
    });

    if (everyoneRole) {
      await prisma.memberRole.create({
        data: {
          membershipId: membership.id,
          roleId: everyoneRole.id,
        },
      });
    }

    // Get full member data for socket event
    const newMember = await prisma.programMembership.findUnique({
      where: { id: membership.id },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        memberRoles: { include: { role: true } },
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io && newMember) {
      io.to(`program:${id}`).emit('member:joined', {
        programId: id,
        member: {
          id: newMember.id,
          userId: newMember.user.id,
          displayName: newMember.user.displayName,
          avatarUrl: newMember.user.avatarUrl,
          nickname: newMember.nickname,
          roles: newMember.memberRoles.map(mr => ({
            id: mr.role.id,
            name: mr.role.name,
            color: mr.role.color,
            tier: mr.role.tier,
          })),
          joinedAt: newMember.joinedAt.toISOString(),
        },
      });
    }

    // ── Push Notification to approved user (fire-and-forget) ──
    (async () => {
      try {
        const programInfo = await prisma.program.findUnique({
          where: { id },
          select: { name: true },
        });
        const approverInfo = await prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true },
        });
        if (programInfo && approverInfo) {
          await sendPushToUsers([request.userId], buildProgramInviteNotification({
            inviterName: approverInfo.displayName,
            programName: programInfo.name,
            programId: id,
          }));
        }
      } catch (pushError) {
        console.error('[Push] Join request approval push failed:', pushError);
      }
    })();

    res.json({
      success: true,
      message: `${request.user.displayName} has been approved and added to the program`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/:id/join-requests/:requestId/reject
 * Reject a join request
 */
router.post('/:id/join-requests/:requestId/reject', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, requestId } = req.params;
    const userId = req.user!.id;

    const userPerms = await getUserPermissions(userId, id, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.INVITE_MEMBERS)) {
      throw new ForbiddenError('You do not have permission to manage join requests');
    }

    const request = await prisma.joinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.programId !== id) {
      throw new NotFoundError('Join request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestError('This request has already been processed');
    }

    await prisma.joinRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Join request rejected',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/:id/transfer-ownership
 * Transfer program ownership to another user
 */
router.post('/:id/transfer-ownership', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { newOwnerId } = req.body;

    if (!newOwnerId) {
      throw new BadRequestError('New owner ID is required');
    }

    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true, name: true },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can transfer ownership');
    }

    // Check if new owner is a member
    const newOwnerMembership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId: newOwnerId, programId: id } },
    });

    if (!newOwnerMembership) {
      throw new BadRequestError('New owner must be a member of the program');
    }

    // Get the Owner role
    const ownerRole = await prisma.role.findFirst({
      where: { programId: id, tier: 0 },
    });

    if (ownerRole) {
      // Remove Owner role from current owner
      const currentOwnerMembership = await prisma.programMembership.findUnique({
        where: { userId_programId: { userId, programId: id } },
      });

      if (currentOwnerMembership) {
        await prisma.memberRole.deleteMany({
          where: {
            membershipId: currentOwnerMembership.id,
            roleId: ownerRole.id,
          },
        });
      }

      // Add Owner role to new owner
      await prisma.memberRole.upsert({
        where: {
          membershipId_roleId: {
            membershipId: newOwnerMembership.id,
            roleId: ownerRole.id,
          },
        },
        create: {
          membershipId: newOwnerMembership.id,
          roleId: ownerRole.id,
        },
        update: {},
      });
    }

    // Update program owner
    await prisma.program.update({
      where: { id },
      data: { ownerId: newOwnerId },
    });

    res.json({
      success: true,
      message: 'Ownership transferred successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/programs/:id/archive
 * Archive a program (soft delete)
 */
router.patch('/:id/archive', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true, isDefault: true },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.isDefault) {
      throw new BadRequestError('Cannot archive the default program');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can archive the program');
    }

    await prisma.program.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    res.json({
      success: true,
      message: 'Program archived successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/programs/:id/restore
 * Restore an archived program
 */
router.patch('/:id/restore', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const program = await prisma.program.findUnique({
      where: { id },
      select: { ownerId: true, status: true },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.status !== 'ARCHIVED') {
      throw new BadRequestError('Program is not archived');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can restore the program');
    }

    await prisma.program.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    res.json({
      success: true,
      message: 'Program restored successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CATEGORY MANAGEMENT
// ============================================

/**
 * POST /api/programs/:id/categories
 * Create a new category
 */
router.post('/:id/categories', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId } = req.params;
    const userId = req.user!.id;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Category name is required');
    }

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage categories');
    }

    // Get max position for new category
    const maxPos = await prisma.category.aggregate({
      where: { programId },
      _max: { position: true },
    });

    const category = await prisma.category.create({
      data: {
        programId,
        name: name.trim(),
        position: (maxPos._max.position ?? -1) + 1,
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('category:created', {
        programId,
        category: { ...category, channels: [] },
      });
    }

    res.status(201).json({
      success: true,
      data: { category },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/programs/:id/categories/:categoryId
 * Update a category
 */
router.patch('/:id/categories/:categoryId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, categoryId } = req.params;
    const userId = req.user!.id;
    const { name } = req.body;

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage categories');
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, programId },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: { name: name?.trim() },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('category:updated', {
        programId,
        category: updated,
      });
    }

    res.json({
      success: true,
      data: { category: updated },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/programs/:id/categories/:categoryId
 * Delete a category (moves channels to uncategorized)
 */
router.delete('/:id/categories/:categoryId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, categoryId } = req.params;
    const userId = req.user!.id;

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage categories');
    }

    const category = await prisma.category.findFirst({
      where: { id: categoryId, programId },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Channels will have categoryId set to null due to onDelete: SetNull
    await prisma.category.delete({
      where: { id: categoryId },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('category:deleted', {
        programId,
        categoryId,
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully. Channels moved to uncategorized.',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CHANNEL MANAGEMENT
// ============================================

/**
 * POST /api/programs/:id/channels
 * Create a new channel
 */
router.post('/:id/channels', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId } = req.params;
    const userId = req.user!.id;
    const { name, topic, type = 'TEXT', categoryId, isPrivate = false } = req.body;

    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Channel name is required');
    }

    // Validate channel name (lowercase, no spaces, alphanumeric + hyphens)
    const channelName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9-]+$/.test(channelName)) {
      throw new BadRequestError('Channel name can only contain lowercase letters, numbers, and hyphens');
    }

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage channels');
    }

    // Validate type
    if (!['TEXT', 'ANNOUNCEMENT'].includes(type)) {
      throw new BadRequestError('Invalid channel type');
    }

    // If categoryId provided, verify it belongs to this program
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, programId },
      });
      if (!category) {
        throw new BadRequestError('Category not found in this program');
      }
    }

    // Get max position for new channel (within category or uncategorized)
    const maxPos = await prisma.channel.aggregate({
      where: { programId, categoryId: categoryId || null },
      _max: { position: true },
    });

    const channel = await prisma.channel.create({
      data: {
        programId,
        categoryId: categoryId || null,
        name: channelName,
        topic: topic?.trim() || null,
        type,
        isPrivate,
        position: (maxPos._max.position ?? -1) + 1,
        createdById: userId,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('channel:created', {
        programId,
        channel,
      });
    }

    res.status(201).json({
      success: true,
      data: { channel },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/programs/:id/channels/:channelId
 * Update a channel
 */
router.patch('/:id/channels/:channelId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, channelId } = req.params;
    const userId = req.user!.id;
    const { name, topic, type, categoryId, isPrivate } = req.body;

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage channels');
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, programId },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined) {
      const channelName = name.trim().toLowerCase().replace(/\s+/g, '-');
      if (!/^[a-z0-9-]+$/.test(channelName)) {
        throw new BadRequestError('Channel name can only contain lowercase letters, numbers, and hyphens');
      }
      updateData.name = channelName;
    }

    if (topic !== undefined) {
      updateData.topic = topic?.trim() || null;
    }

    if (type !== undefined) {
      if (!['TEXT', 'ANNOUNCEMENT'].includes(type)) {
        throw new BadRequestError('Invalid channel type');
      }
      updateData.type = type;
    }

    if (categoryId !== undefined) {
      if (categoryId === null) {
        updateData.categoryId = null;
      } else {
        const category = await prisma.category.findFirst({
          where: { id: categoryId, programId },
        });
        if (!category) {
          throw new BadRequestError('Category not found in this program');
        }
        updateData.categoryId = categoryId;
      }
    }

    if (isPrivate !== undefined) {
      updateData.isPrivate = isPrivate;
    }

    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('channel:updated', {
        programId,
        channel: updated,
      });
    }

    res.json({
      success: true,
      data: { channel: updated },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/programs/:id/channels/:channelId
 * Delete a channel
 */
router.delete('/:id/channels/:channelId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, channelId } = req.params;
    const userId = req.user!.id;

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage channels');
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, programId },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Check if channel is protected
    if (channel.isProtected) {
      throw new ForbiddenError('This channel is protected and cannot be deleted');
    }

    await prisma.channel.delete({
      where: { id: channelId },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('channel:deleted', {
        programId,
        channelId,
      });
    }

    res.json({
      success: true,
      message: 'Channel deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/programs/:id/channels/:channelId/move
 * Move a channel to a different category
 */
router.post('/:id/channels/:channelId/move', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, channelId } = req.params;
    const userId = req.user!.id;
    const { categoryId, position } = req.body; // categoryId (null for uncategorized)

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage channels');
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, programId },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // If categoryId provided, verify it belongs to this program
    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, programId },
      });
      if (!category) {
        throw new BadRequestError('Category not found in this program');
      }
    }

    const fromCategoryId = channel.categoryId;
    
    const updated = await prisma.channel.update({
      where: { id: channelId },
      data: {
        categoryId: categoryId || null,
        position: position ?? 0,
      },
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('channel:moved', {
        programId,
        channelId,
        fromCategoryId,
        toCategoryId: categoryId || null,
        channel: updated,
      });
    }

    res.json({
      success: true,
      data: { channel: updated },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CHANNEL PERMISSIONS (for private channels)
// ============================================

/**
 * GET /api/programs/:id/channels/:channelId/permissions
 * Get channel permission overrides
 */
router.get('/:id/channels/:channelId/permissions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, channelId } = req.params;
    const userId = req.user!.id;

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to view channel permissions');
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, programId },
      select: { id: true, name: true, isPrivate: true },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    const rawPermissions = await prisma.permissionOverride.findMany({
      where: { channelId },
      include: {
        role: {
          select: { id: true, name: true, color: true },
        },
        user: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Convert BigInt fields to strings for JSON serialization
    const permissions = rawPermissions.map(p => ({
      id: p.id,
      role: p.role,
      user: p.user,
      allow: p.allow.toString(),
      deny: p.deny.toString(),
    }));

    res.json({
      success: true,
      data: { 
        channel,
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/programs/:id/channels/:channelId/permissions
 * Set channel permission overrides (for private channels)
 */
router.put('/:id/channels/:channelId/permissions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: programId, channelId } = req.params;
    const userId = req.user!.id;
    const { roleIds, userIds } = req.body; // Arrays of role/user IDs that can access this private channel

    // Check MANAGE_CHANNELS permission
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!hasPermission(userPerms, Permissions.MANAGE_CHANNELS)) {
      throw new ForbiddenError('You do not have permission to manage channel permissions');
    }

    const channel = await prisma.channel.findFirst({
      where: { id: channelId, programId },
    });

    if (!channel) {
      throw new NotFoundError('Channel not found');
    }

    // Delete existing overrides and create new ones
    await prisma.$transaction(async (tx) => {
      // Remove existing overrides
      await tx.permissionOverride.deleteMany({
        where: { channelId },
      });

      // Add role overrides (VIEW_CHANNEL permission = 1)
      if (Array.isArray(roleIds) && roleIds.length > 0) {
        await tx.permissionOverride.createMany({
          data: roleIds.map((roleId: string) => ({
            channelId,
            roleId,
            allow: BigInt(1), // VIEW_CHANNEL
            deny: BigInt(0),
          })),
        });
      }

      // Add user overrides
      if (Array.isArray(userIds) && userIds.length > 0) {
        await tx.permissionOverride.createMany({
          data: userIds.map((uid: string) => ({
            channelId,
            userId: uid,
            allow: BigInt(1), // VIEW_CHANNEL
            deny: BigInt(0),
          })),
        });
      }
    });

    res.json({
      success: true,
      message: 'Channel permissions updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
