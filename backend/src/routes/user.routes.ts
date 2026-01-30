import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isSuperAdmin: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get user's programs
    const memberships = await prisma.programMembership.findMany({
      where: { userId },
      include: {
        program: {
          select: {
            id: true,
            name: true,
            iconUrl: true,
            isDefault: true,
            status: true,
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

    res.json({
      success: true,
      data: {
        user,
        programs: memberships.map(m => ({
          ...m.program,
          nickname: m.nickname,
          roles: m.memberRoles.map(mr => mr.role),
          joinedAt: m.joinedAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/me
 * Update current user profile
 */
router.patch('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { displayName, avatarUrl } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName && { displayName }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isSuperAdmin: true,
      },
    });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:id
 * Get user by ID (public profile)
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/search
 * Search users by name
 */
router.get('/search', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({
        success: true,
        data: { users: [] },
      });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
      take: Math.min(Number(limit), 50),
    });

    res.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
