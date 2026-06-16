import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError } from '../middleware/errorHandler';
import { supabase, STORAGE_BUCKET } from '../config/supabase';

const router = Router();

// Multer config for avatar uploads (images only, 5MB max)
const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    if (AVATAR_ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid image type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WebP, HEIC`));
    }
  },
});

// Hex color validation
const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6})$/;

/**
 * Helper: Clean expired custom status from a user object.
 * Returns the user with status fields nullified if expired.
 */
function cleanExpiredStatus(user: any): any {
  if (user.statusExpiresAt && new Date(user.statusExpiresAt) < new Date()) {
    return {
      ...user,
      statusEmoji: null,
      statusText: null,
      statusExpiresAt: null,
    };
  }
  return user;
}

/**
 * Helper: Clear expired status in the DB (fire-and-forget).
 */
async function clearExpiredStatusInDb(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        statusEmoji: null,
        statusText: null,
        statusExpiresAt: null,
      },
    });
  } catch (error) {
    console.error('Failed to clear expired status:', error);
  }
}

/**
 * Helper: Delete an avatar file from Supabase Storage given its public URL.
 */
async function deleteAvatarFromStorage(avatarUrl: string): Promise<void> {
  try {
    const url = new URL(avatarUrl);
    const pathParts = url.pathname.split('/storage/v1/object/public/');
    if (pathParts.length > 1) {
      const storagePath = pathParts[1].replace(`${STORAGE_BUCKET}/`, '');
      // Only delete if it's in our avatars/ prefix (don't delete Google profile pics)
      if (storagePath.startsWith('avatars/')) {
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);
        if (error) {
          console.error('Failed to delete old avatar from storage:', error);
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse avatar URL for deletion:', error);
  }
}

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const rawUser = await prisma.user.findUnique({
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
        bio: true,
        bannerColor: true,
        statusEmoji: true,
        statusText: true,
        statusExpiresAt: true,
        authProvider: true,
      },
    });

    if (!rawUser) {
      throw new NotFoundError('User not found');
    }

    // Clean expired status
    const user = cleanExpiredStatus(rawUser);
    if (user.statusEmoji !== rawUser.statusEmoji) {
      // Status was expired — clear in DB (fire-and-forget)
      clearExpiredStatusInDb(userId);
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
    const { displayName, avatarUrl, bio, bannerColor, statusEmoji, statusText, statusExpiresAt } = req.body;

    // Build update data with validation
    const updateData: any = {};

    // Display name validation
    if (displayName !== undefined) {
      const trimmed = String(displayName).trim();
      if (!trimmed) {
        throw new BadRequestError('Display name cannot be empty');
      }
      if (trimmed.length > 100) {
        throw new BadRequestError('Display name cannot exceed 100 characters');
      }
      updateData.displayName = trimmed;
    }

    // Avatar URL (set directly — avatar upload endpoint handles the file)
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }

    // Bio validation (max 280 chars, allow null to clear)
    if (bio !== undefined) {
      if (bio === null || bio === '') {
        updateData.bio = null;
      } else {
        const trimmedBio = String(bio).trim();
        if (trimmedBio.length > 280) {
          throw new BadRequestError('Bio cannot exceed 280 characters');
        }
        updateData.bio = trimmedBio;
      }
    }

    // Banner color validation (must be valid hex)
    if (bannerColor !== undefined) {
      if (!HEX_COLOR_REGEX.test(bannerColor)) {
        throw new BadRequestError('Banner color must be a valid hex color (e.g., #3B82F6)');
      }
      updateData.bannerColor = bannerColor;
    }

    // Custom status (emoji + text, updated together)
    if (statusEmoji !== undefined || statusText !== undefined) {
      // Allow clearing status by sending null/empty values
      const emoji = statusEmoji ? String(statusEmoji).trim() : null;
      const text = statusText ? String(statusText).trim() : null;

      if (!emoji && !text) {
        // Clearing status entirely
        updateData.statusEmoji = null;
        updateData.statusText = null;
        updateData.statusExpiresAt = null;
      } else {
        if (text && text.length > 128) {
          throw new BadRequestError('Status text cannot exceed 128 characters');
        }
        updateData.statusEmoji = emoji;
        updateData.statusText = text;

        // Status expiration
        if (statusExpiresAt !== undefined) {
          if (statusExpiresAt === null) {
            updateData.statusExpiresAt = null; // Never expires
          } else {
            const expiresDate = new Date(statusExpiresAt);
            if (isNaN(expiresDate.getTime())) {
              throw new BadRequestError('Invalid status expiration date');
            }
            if (expiresDate <= new Date()) {
              throw new BadRequestError('Status expiration must be in the future');
            }
            updateData.statusExpiresAt = expiresDate;
          }
        }
      }
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError('No valid fields to update');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isSuperAdmin: true,
        bio: true,
        bannerColor: true,
        statusEmoji: true,
        statusText: true,
        statusExpiresAt: true,
      },
    });

    // Emit profile update to all programs the user is in AND to DM partners
    const io = req.app.get('io');
    if (io) {
      const profileData = {
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        bannerColor: user.bannerColor,
        statusEmoji: user.statusEmoji,
        statusText: user.statusText,
        statusExpiresAt: user.statusExpiresAt,
      };
      
      // Emit to all programs
      const memberships = await prisma.programMembership.findMany({
        where: { userId },
        select: { programId: true },
      });
      
      memberships.forEach(m => {
        io.to(`program:${m.programId}`).emit('user:profile_updated', profileData);
      });
      
      // Also emit to all DM conversation partners
      const conversations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversation: { select: { participants: { select: { userId: true } } } } },
      });
      const dmPartnerIds = new Set<string>();
      conversations.forEach(cp => {
        cp.conversation.participants.forEach(p => {
          if (p.userId !== userId) dmPartnerIds.add(p.userId);
        });
      });
      dmPartnerIds.forEach(partnerId => {
        io.to(`user:${partnerId}`).emit('user:profile_updated', profileData);
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// AVATAR UPLOAD
// ============================================

/**
 * POST /api/users/me/avatar
 * Upload a profile avatar image.
 * Replaces existing avatar (deletes old file from storage).
 */
router.post(
  '/me/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const file = req.file;

      if (!file) {
        throw new BadRequestError('No image file provided. Send as multipart/form-data with field name "avatar"');
      }

      // Get current user to check for existing avatar
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      });

      // Upload to Supabase Storage
      const timestamp = Date.now();
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `avatars/${userId}/${timestamp}_${safeFileName}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        console.error('Avatar upload error:', error);
        throw new BadRequestError('Failed to upload avatar image');
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const newAvatarUrl = urlData.publicUrl;

      // Update user's avatarUrl
      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: newAvatarUrl },
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isSuperAdmin: true,
          bio: true,
          bannerColor: true,
          statusEmoji: true,
          statusText: true,
          statusExpiresAt: true,
        },
      });

      // Delete old avatar from storage (fire-and-forget, only if it was a custom upload)
      if (currentUser?.avatarUrl) {
        deleteAvatarFromStorage(currentUser.avatarUrl);
      }

      // Emit profile update
      const io = req.app.get('io');
      if (io) {
        const profileData = {
          userId: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          bannerColor: user.bannerColor,
          statusEmoji: user.statusEmoji,
          statusText: user.statusText,
          statusExpiresAt: user.statusExpiresAt,
        };

        const memberships = await prisma.programMembership.findMany({
          where: { userId },
          select: { programId: true },
        });
        memberships.forEach(m => {
          io.to(`program:${m.programId}`).emit('user:profile_updated', profileData);
        });

        const conversations = await prisma.conversationParticipant.findMany({
          where: { userId },
          select: { conversation: { select: { participants: { select: { userId: true } } } } },
        });
        const dmPartnerIds = new Set<string>();
        conversations.forEach(cp => {
          cp.conversation.participants.forEach(p => {
            if (p.userId !== userId) dmPartnerIds.add(p.userId);
          });
        });
        dmPartnerIds.forEach(partnerId => {
          io.to(`user:${partnerId}`).emit('user:profile_updated', profileData);
        });
      }

      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/users/me/avatar
 * Remove the user's avatar and revert to letter initial.
 */
router.delete('/me/avatar', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    // Get current avatar URL
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (!currentUser?.avatarUrl) {
      throw new BadRequestError('No avatar to remove');
    }

    // Delete from storage
    await deleteAvatarFromStorage(currentUser.avatarUrl);

    // Clear avatarUrl
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        isSuperAdmin: true,
        bio: true,
        bannerColor: true,
        statusEmoji: true,
        statusText: true,
        statusExpiresAt: true,
      },
    });

    // Emit profile update
    const io = req.app.get('io');
    if (io) {
      const profileData = {
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: null,
        bio: user.bio,
        bannerColor: user.bannerColor,
        statusEmoji: user.statusEmoji,
        statusText: user.statusText,
        statusExpiresAt: user.statusExpiresAt,
      };

      const memberships = await prisma.programMembership.findMany({
        where: { userId },
        select: { programId: true },
      });
      memberships.forEach(m => {
        io.to(`program:${m.programId}`).emit('user:profile_updated', profileData);
      });

      const conversations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversation: { select: { participants: { select: { userId: true } } } } },
      });
      const dmPartnerIds = new Set<string>();
      conversations.forEach(cp => {
        cp.conversation.participants.forEach(p => {
          if (p.userId !== userId) dmPartnerIds.add(p.userId);
        });
      });
      dmPartnerIds.forEach(partnerId => {
        io.to(`user:${partnerId}`).emit('user:profile_updated', profileData);
      });
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
 * Search users by name or email
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
router.get('/search', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user!.id;
    const { q, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({
        success: true,
        data: { users: [] },
      });
    }

    // SEC-08: only return users who share at least one program with the caller.
    // This prevents global directory/email enumeration while still letting users
    // find people they can actually start a conversation with.
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: currentUserId },
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
        memberships: {
          some: { program: { memberships: { some: { userId: currentUserId } } } },
        },
      },
      select: {
        id: true,
        displayName: true,
        email: true,
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

/**
 * GET /api/users/:userId/shared-program
 * Returns the first program that both the current user and the target user share.
 * Used for navigating to a member profile from DMs (which have no program context).
 */
router.get('/:userId/shared-program', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = req.user!.id;
    const { userId: targetUserId } = req.params;

    // Find programs where both users are members
    const shared = await prisma.programMembership.findFirst({
      where: {
        userId: targetUserId,
        program: {
          memberships: {
            some: { userId: currentUserId },
          },
        },
      },
      select: { programId: true },
    });

    res.json({
      success: true,
      data: { programId: shared?.programId || null },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// PUSH TOKEN MANAGEMENT
// ============================================

/**
 * POST /api/users/push-token
 * Register an Expo push notification token for the current user.
 * If the token already exists for another user, it is reassigned (device changed accounts).
 * If the token already exists for this user, it is updated (idempotent).
 */
router.post('/push-token', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { token, platform } = req.body;

    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Push token is required');
    }

    // Validate it looks like an Expo push token
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      throw new BadRequestError('Invalid Expo push token format');
    }

    const validPlatform = platform === 'android' ? 'android' : 'ios';

    // Upsert: if token exists (even for another user), reassign to current user
    await prisma.pushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: validPlatform,
      },
      update: {
        userId,
        platform: validPlatform,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: 'Push token registered',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/push-token
 * Remove an Expo push token (e.g., on logout).
 * Removes the specific token regardless of which user it belongs to.
 */
router.delete('/push-token', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Push token is required');
    }

    await prisma.pushToken.deleteMany({
      where: { token },
    });

    res.json({
      success: true,
      message: 'Push token removed',
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

    const rawUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        lastSeenAt: true,
        createdAt: true,
        bio: true,
        bannerColor: true,
        statusEmoji: true,
        statusText: true,
        statusExpiresAt: true,
      },
    });

    if (!rawUser) {
      throw new NotFoundError('User not found');
    }

    // Clean expired status
    const user = cleanExpiredStatus(rawUser);
    if (user.statusEmoji !== rawUser.statusEmoji) {
      clearExpiredStatusInDb(id);
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
