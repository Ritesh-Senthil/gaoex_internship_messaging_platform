import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { verifyFirebaseToken } from '../config/firebase';
import { generateTokens } from '../utils/jwt';
import { BadRequestError, UnauthorizedError } from '../middleware/errorHandler';
import { PermissionPresets } from '../utils/permissions';

const router = Router();

/**
 * POST /api/auth/firebase
 * Authenticate user with Firebase ID token
 * 
 * The mobile app handles Google/Facebook sign-in via Firebase Auth,
 * then sends the Firebase ID token to this endpoint.
 * 
 * We verify the token, create/update user in our database,
 * and return our own JWT tokens for API access.
 */
router.post('/firebase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      throw new BadRequestError('Firebase ID token is required');
    }

    // Verify Firebase token
    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(idToken);
    } catch (error) {
      console.error('Firebase token verification failed:', error);
      throw new UnauthorizedError('Invalid or expired Firebase token');
    }

    // Extract user info from Firebase token
    const {
      uid: firebaseUid,
      email,
      name,
      picture,
      firebase: { sign_in_provider },
    } = firebaseUser;

    if (!email) {
      throw new BadRequestError('Email is required. Please use an account with an email address.');
    }

    // Determine auth provider from Firebase sign-in method
    let authProvider: 'GOOGLE' | 'FACEBOOK' = 'GOOGLE';
    if (sign_in_provider === 'facebook.com') {
      authProvider = 'FACEBOOK';
    } else if (sign_in_provider === 'google.com') {
      authProvider = 'GOOGLE';
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: {
        authProvider_authProviderId: {
          authProvider,
          authProviderId: firebaseUid,
        },
      },
    });

    let isNewUser = false;

    if (!user) {
      // Check if user exists with same email but different provider
      const existingEmailUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmailUser) {
        // Link accounts - update to use Firebase UID
        user = await prisma.user.update({
          where: { id: existingEmailUser.id },
          data: {
            authProvider,
            authProviderId: firebaseUid,
            avatarUrl: picture || existingEmailUser.avatarUrl,
            lastSeenAt: new Date(),
          },
        });
      } else {
        // Create new user
        isNewUser = true;
        
        user = await prisma.user.create({
          data: {
            email,
            displayName: name || email.split('@')[0],
            avatarUrl: picture,
            authProvider,
            authProviderId: firebaseUid,
          },
        });

        // Auto-join default program
        await joinDefaultProgram(user.id);
      }
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          lastSeenAt: new Date(),
          // Update avatar if changed
          ...(picture && { avatarUrl: picture }),
        },
      });
    }

    // Generate our own JWT tokens for API access
    const tokens = await generateTokens(user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isSuperAdmin: user.isSuperAdmin,
        },
        tokens,
        isNewUser,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new BadRequestError('Refresh token is required');
    }

    // Check if token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // Delete expired token if exists
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedError('User account is deactivated');
    }

    // Delete old refresh token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Generate new tokens
    const tokens = await generateTokens(storedToken.userId);

    res.json({
      success: true,
      data: { tokens },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Delete refresh token from database
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout-all
 * Invalidate all refresh tokens for a user (logout from all devices)
 */
router.post('/logout-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    res.json({
      success: true,
      message: `Logged out from ${result.count} device(s)`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper: Join user to default program with @everyone role
 */
async function joinDefaultProgram(userId: string): Promise<void> {
  const defaultProgram = await prisma.program.findFirst({
    where: { isDefault: true },
    include: {
      roles: {
        where: { isEveryone: true },
      },
    },
  });

  if (!defaultProgram) {
    console.warn('Default program not found. Run the seed script.');
    return;
  }

  // Create membership
  const membership = await prisma.programMembership.create({
    data: {
      userId,
      programId: defaultProgram.id,
    },
  });

  // Assign @everyone role
  const everyoneRole = defaultProgram.roles[0];
  if (everyoneRole) {
    await prisma.memberRole.create({
      data: {
        membershipId: membership.id,
        roleId: everyoneRole.id,
      },
    });
  }
}

export default router;
