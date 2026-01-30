import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { PermissionPresets } from '../utils/permissions';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

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
          include: {
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
                position: true,
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

    const programs = memberships.map(m => ({
      id: m.program.id,
      name: m.program.name,
      description: m.program.description,
      iconUrl: m.program.iconUrl,
      isDefault: m.program.isDefault,
      status: m.program.status,
      memberCount: m.program._count.memberships,
      channelCount: m.program._count.channels,
      nickname: m.nickname,
      roles: m.memberRoles.map(mr => mr.role).sort((a, b) => b.position - a.position),
      joinedAt: m.joinedAt,
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
    const { name, description, iconUrl, startDate, endDate } = req.body;

    if (!name) {
      throw new BadRequestError('Program name is required');
    }

    // Create program with default roles and channels
    const program = await prisma.$transaction(async (tx) => {
      // Create program
      const newProgram = await tx.program.create({
        data: {
          name,
          description,
          iconUrl,
          ownerId: userId,
          inviteCode: uuidv4().substring(0, 8).toUpperCase(),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
        },
      });

      // Create @everyone role
      const everyoneRole = await tx.role.create({
        data: {
          programId: newProgram.id,
          name: '@everyone',
          position: 0,
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

    // Check membership
    const membership = await prisma.programMembership.findUnique({
      where: {
        userId_programId: { userId, programId: id },
      },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
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

    res.json({
      success: true,
      data: { program },
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
 * Archive/delete program
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const program = await prisma.program.findUnique({
      where: { id },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Cannot delete default program
    if (program.isDefault) {
      throw new ForbiddenError('Cannot delete the default program');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can delete this program');
    }

    // Archive instead of hard delete
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
 * POST /api/programs/join
 * Join program via invite code
 */
router.post('/join', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { inviteCode } = req.body;

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

    // Create membership
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

    res.json({
      success: true,
      data: {
        program: {
          id: program.id,
          name: program.name,
          iconUrl: program.iconUrl,
        },
      },
    });
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

    const program = await prisma.program.findUnique({
      where: { id },
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.ownerId !== userId && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('Only the program owner can regenerate invite code');
    }

    const newInviteCode = uuidv4().substring(0, 8).toUpperCase();

    await prisma.program.update({
      where: { id },
      data: { inviteCode: newInviteCode },
    });

    res.json({
      success: true,
      data: { inviteCode: newInviteCode },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
