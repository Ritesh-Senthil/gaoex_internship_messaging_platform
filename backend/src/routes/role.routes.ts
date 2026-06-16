/**
 * Role Management Routes
 * Tier-based hierarchy system (3 tiers):
 * - Tier 0: Owner (program creator, full control)
 * - Tier 1: Admin (can manage Members, all permissions)
 * - Tier 2: Member (basic access, customizable with permissions)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { 
  Permissions, 
  hasPermission, 
  combineRolePermissions,
  getPermissionNames,
  createPermissionBitfield,
  PermissionKey,
  PermissionPresets,
} from '../utils/permissions';

const router = Router();

// ── Validation schemas (SEC-07) ──
const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required'),
  color: z.string().optional(),
  tier: z.number().int().optional(),
  permissions: z.array(z.string()).optional(),
  isHoisted: z.boolean().optional(),
  isMentionable: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name cannot be empty').optional(),
  color: z.string().optional(),
  tier: z.number().int().optional(),
  permissions: z.array(z.string()).optional(),
  isHoisted: z.boolean().optional(),
  isMentionable: z.boolean().optional(),
});

const assignRoleSchema = z.object({
  roleId: z.string().min(1, 'roleId is required'),
});

// ============================================
// TIER DEFINITIONS
// ============================================

export const ROLE_TIERS = {
  OWNER: 0,   // Full control (auto-assigned to program owner)
  ADMIN: 1,   // Can manage Members, all permissions available
  MEMBER: 2,  // Basic access, customizable with permissions
} as const;

export const TIER_NAMES: Record<number, string> = {
  0: 'Owner',
  1: 'Admin',
  2: 'Member',
};

// Permissions allowed per tier (maximum)
export const TIER_MAX_PERMISSIONS: Record<number, bigint> = {
  0: PermissionPresets.ALL, // Owner can have all
  1: PermissionPresets.ALL, // Admin: all permissions (including ADMINISTRATOR)
  2: // Member: messaging + moderate + invite
    Permissions.SEND_MESSAGES |
    Permissions.ATTACH_FILES |
    Permissions.MENTION_EVERYONE |
    Permissions.MANAGE_MESSAGES |
    Permissions.INVITE_MEMBERS,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get user's lowest tier (most authority) in a program
 * Lower tier number = more authority
 * Super Admin always has Owner tier (0)
 */
async function getUserLowestTier(userId: string, programId: string, isSuperAdmin = false): Promise<number> {
  // Super Admin has Owner-level access everywhere
  if (isSuperAdmin) {
    return ROLE_TIERS.OWNER;
  }

  // Check if user is program owner (tier 0)
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });

  if (program?.ownerId === userId) {
    return ROLE_TIERS.OWNER;
  }

  const membership = await prisma.programMembership.findUnique({
    where: { userId_programId: { userId, programId } },
    include: {
      memberRoles: {
        include: { role: { select: { tier: true } } },
      },
    },
  });

  if (!membership) return 999; // Not a member

  const tiers = membership.memberRoles.map(mr => mr.role.tier);
  return tiers.length > 0 ? Math.min(...tiers) : ROLE_TIERS.MEMBER;
}

/**
 * Get user's combined permissions in a program
 * Super Admin always has all permissions
 */
async function getUserPermissions(userId: string, programId: string, isSuperAdmin = false): Promise<bigint> {
  // Super Admin has all permissions everywhere
  if (isSuperAdmin) {
    return PermissionPresets.ALL;
  }

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });

  if (program?.ownerId === userId) {
    return PermissionPresets.ALL;
  }

  const membership = await prisma.programMembership.findUnique({
    where: { userId_programId: { userId, programId } },
    include: {
      memberRoles: {
        include: { role: { select: { permissions: true } } },
      },
    },
  });

  if (!membership) return 0n;

  const rolePermissions = membership.memberRoles.map(mr => mr.role.permissions);
  return combineRolePermissions(rolePermissions);
}

/**
 * Check if user is program owner
 */
async function isOwner(userId: string, programId: string): Promise<boolean> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });
  return program?.ownerId === userId;
}

/**
 * Check if user can manage a role based on tier
 * A user can manage roles whose tier is strictly greater (less authority) than theirs.
 */
function canManageTier(userTier: number, targetTier: number): boolean {
  // Owner can manage all tiers
  if (userTier === ROLE_TIERS.OWNER) return true;
  // Admin can manage Member tier
  if (userTier === ROLE_TIERS.ADMIN && targetTier >= ROLE_TIERS.MEMBER) return true;
  // Members can't manage anyone
  return false;
}

/**
 * Validate permissions against tier maximum
 */
function validateTierPermissions(tier: number, permissions: bigint): boolean {
  const maxPerms = TIER_MAX_PERMISSIONS[tier] ?? 0n;
  // Check if permissions is a subset of maxPerms
  return (permissions & ~maxPerms) === 0n;
}

// ============================================
// GET ALL ROLES
// ============================================

router.get('/:programId/roles', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId } = req.params;
    const userId = req.user!.id;

    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId } },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    const roles = await prisma.role.findMany({
      where: { programId },
      orderBy: { tier: 'asc' }, // Lower tier (more authority) first
      include: {
        _count: { select: { memberRoles: true } },
      },
    });

    const rolesWithDetails = roles.map(role => ({
      ...role,
      permissions: role.permissions.toString(),
      memberCount: role._count.memberRoles,
      tierName: TIER_NAMES[role.tier] || 'Unknown',
    }));

    res.json({
      success: true,
      data: { roles: rolesWithDetails },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET SINGLE ROLE
// ============================================

router.get('/:programId/roles/:roleId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, roleId } = req.params;
    const userId = req.user!.id;

    const membership = await prisma.programMembership.findUnique({
      where: { userId_programId: { userId, programId } },
    });

    if (!membership && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You are not a member of this program');
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        _count: { select: { memberRoles: true } },
        memberRoles: {
          include: {
            membership: {
              include: {
                user: { select: { id: true, displayName: true, avatarUrl: true } },
              },
            },
          },
          take: 10,
        },
      },
    });

    if (!role || role.programId !== programId) {
      throw new NotFoundError('Role not found');
    }

    const permissionNames = getPermissionNames(role.permissions);

    res.json({
      success: true,
      data: {
        role: {
          ...role,
          permissions: role.permissions.toString(),
          permissionNames,
          memberCount: role._count.memberRoles,
          tierName: TIER_NAMES[role.tier] || 'Unknown',
          members: role.memberRoles.map(mr => ({
            id: mr.membership.id,
            userId: mr.membership.user.id,
            displayName: mr.membership.user.displayName,
            avatarUrl: mr.membership.user.avatarUrl,
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// CREATE ROLE
// ============================================

router.post('/:programId/roles', authenticate, validateBody(createRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId } = req.params;
    const userId = req.user!.id;
    const { name, color, tier, permissions: permissionNames, isHoisted, isMentionable } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new BadRequestError('Role name is required');
    }

    if (name.toLowerCase() === '@everyone') {
      throw new BadRequestError('Cannot create a role with name @everyone');
    }

    // Validate tier
    const roleTier = tier ?? ROLE_TIERS.MEMBER;
    if (![ROLE_TIERS.ADMIN, ROLE_TIERS.MEMBER].includes(roleTier)) {
      throw new BadRequestError('Invalid tier. Must be 1 (Admin) or 2 (Member)');
    }

    // Check user's tier
    const userTier = await getUserLowestTier(userId, programId, req.user!.isSuperAdmin);
    const ownerStatus = await isOwner(userId, programId);

    // Must have MANAGE_ROLES or be owner/super admin
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    if (!ownerStatus && !hasPermission(userPerms, Permissions.MANAGE_ROLES) && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to manage roles');
    }

    // Can only create roles in tiers you can manage
    if (!req.user!.isSuperAdmin && !canManageTier(userTier, roleTier)) {
      throw new ForbiddenError(`You cannot create ${TIER_NAMES[roleTier]} roles`);
    }

    // Create permission bitfield
    let permissionBitfield = 0n;
    if (Array.isArray(permissionNames)) {
      permissionBitfield = createPermissionBitfield(permissionNames as PermissionKey[]);
    }

    // Validate permissions against tier maximum
    if (!validateTierPermissions(roleTier, permissionBitfield)) {
      throw new BadRequestError(`Some permissions are not allowed for ${TIER_NAMES[roleTier]} tier roles`);
    }

    // Check name uniqueness
    const existingRole = await prisma.role.findFirst({
      where: { programId, name: name.trim() },
    });

    if (existingRole) {
      throw new BadRequestError('A role with this name already exists');
    }

    const role = await prisma.role.create({
      data: {
        programId,
        name: name.trim(),
        color: color || '#99AAB5',
        tier: roleTier,
        permissions: permissionBitfield,
        isHoisted: isHoisted ?? false,
        isMentionable: isMentionable ?? false,
        isEveryone: false,
      },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('role:created', {
        programId,
        role: {
          id: role.id,
          name: role.name,
          color: role.color,
          tier: role.tier,
          permissions: role.permissions.toString(),
          memberCount: 0,
        },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        role: {
          ...role,
          permissions: role.permissions.toString(),
          permissionNames: getPermissionNames(role.permissions),
          tierName: TIER_NAMES[role.tier],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// UPDATE ROLE
// ============================================

router.patch('/:programId/roles/:roleId', authenticate, validateBody(updateRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, roleId } = req.params;
    const userId = req.user!.id;
    const { name, color, tier, permissions: permissionNames, isHoisted, isMentionable } = req.body;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role || role.programId !== programId) {
      throw new NotFoundError('Role not found');
    }

    // Check permissions
    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    const ownerStatus = await isOwner(userId, programId);
    const userTier = await getUserLowestTier(userId, programId, req.user!.isSuperAdmin);

    if (!ownerStatus && !hasPermission(userPerms, Permissions.MANAGE_ROLES) && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to manage roles');
    }

    // Can only edit roles in tiers you can manage
    if (!req.user!.isSuperAdmin && !canManageTier(userTier, role.tier)) {
      throw new ForbiddenError(`You cannot edit ${TIER_NAMES[role.tier]} roles`);
    }

    // Can't change tier of @everyone
    if (role.isEveryone && tier !== undefined && tier !== role.tier) {
      throw new BadRequestError('Cannot change the tier of @everyone role');
    }

    // Can't rename @everyone
    if (role.isEveryone && name && name !== '@everyone') {
      throw new BadRequestError('Cannot rename the @everyone role');
    }

    // Validate new tier if changing
    const newTier = tier ?? role.tier;
    if (tier !== undefined && ![ROLE_TIERS.ADMIN, ROLE_TIERS.MEMBER].includes(tier)) {
      throw new BadRequestError('Invalid tier. Must be 1 (Admin) or 2 (Member)');
    }

    // Can only change to tiers you can manage
    if (tier !== undefined && !req.user!.isSuperAdmin && !canManageTier(userTier, tier)) {
      throw new ForbiddenError(`You cannot change role to ${TIER_NAMES[tier]} tier`);
    }

    // Check name uniqueness if changing
    if (name && name.trim() !== role.name) {
      const existingRole = await prisma.role.findFirst({
        where: { programId, name: name.trim(), NOT: { id: roleId } },
      });

      if (existingRole) {
        throw new BadRequestError('A role with this name already exists');
      }
    }

    // Build update data
    const updateData: any = {};

    if (name !== undefined && !role.isEveryone) {
      updateData.name = name.trim();
    }
    if (color !== undefined) {
      updateData.color = color;
    }
    if (tier !== undefined && !role.isEveryone) {
      updateData.tier = tier;
    }
    if (isHoisted !== undefined && !role.isEveryone) {
      updateData.isHoisted = isHoisted;
    }
    if (isMentionable !== undefined && !role.isEveryone) {
      updateData.isMentionable = isMentionable;
    }

    // Handle permissions update
    if (Array.isArray(permissionNames)) {
      const newPermissions = createPermissionBitfield(permissionNames as PermissionKey[]);

      // Validate permissions against tier
      if (!validateTierPermissions(newTier, newPermissions)) {
        throw new BadRequestError(`Some permissions are not allowed for ${TIER_NAMES[newTier]} tier roles`);
      }

      updateData.permissions = newPermissions;
    }

    const updatedRole = await prisma.role.update({
      where: { id: roleId },
      data: updateData,
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('role:updated', {
        programId,
        role: {
          id: updatedRole.id,
          name: updatedRole.name,
          color: updatedRole.color,
          tier: updatedRole.tier,
          permissions: updatedRole.permissions.toString(),
        },
      });
    }

    res.json({
      success: true,
      data: {
        role: {
          ...updatedRole,
          permissions: updatedRole.permissions.toString(),
          permissionNames: getPermissionNames(updatedRole.permissions),
          tierName: TIER_NAMES[updatedRole.tier],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// DELETE ROLE
// ============================================

router.delete('/:programId/roles/:roleId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, roleId } = req.params;
    const userId = req.user!.id;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role || role.programId !== programId) {
      throw new NotFoundError('Role not found');
    }

    if (role.isEveryone) {
      throw new BadRequestError('Cannot delete the @everyone role');
    }

    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    const ownerStatus = await isOwner(userId, programId);
    const userTier = await getUserLowestTier(userId, programId, req.user!.isSuperAdmin);

    if (!ownerStatus && !hasPermission(userPerms, Permissions.MANAGE_ROLES) && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to manage roles');
    }

    // Can only delete roles in tiers you can manage
    if (!req.user!.isSuperAdmin && !canManageTier(userTier, role.tier)) {
      throw new ForbiddenError(`You cannot delete ${TIER_NAMES[role.tier]} roles`);
    }

    await prisma.role.delete({
      where: { id: roleId },
    });

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('role:deleted', {
        programId,
        roleId,
      });
    }

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ASSIGN ROLE TO MEMBER
// ============================================

router.post('/:programId/members/:memberId/roles', authenticate, validateBody(assignRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, memberId } = req.params;
    const userId = req.user!.id;
    const { roleId } = req.body;

    if (!roleId) {
      throw new BadRequestError('roleId is required');
    }

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role || role.programId !== programId) {
      throw new NotFoundError('Role not found');
    }

    if (role.isEveryone) {
      throw new BadRequestError('The @everyone role is automatically assigned to all members');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { id: memberId },
    });

    if (!membership || membership.programId !== programId) {
      throw new NotFoundError('Member not found in this program');
    }

    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    const ownerStatus = await isOwner(userId, programId);
    const userTier = await getUserLowestTier(userId, programId, req.user!.isSuperAdmin);

    if (!ownerStatus && !hasPermission(userPerms, Permissions.MANAGE_ROLES) && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to manage roles');
    }

    // Can only assign roles in tiers you can manage
    if (!req.user!.isSuperAdmin && !canManageTier(userTier, role.tier)) {
      throw new ForbiddenError(`You cannot assign ${TIER_NAMES[role.tier]} roles`);
    }

    const existingAssignment = await prisma.memberRole.findUnique({
      where: { membershipId_roleId: { membershipId: memberId, roleId } },
    });

    if (existingAssignment) {
      throw new BadRequestError('This role is already assigned to this member');
    }

    await prisma.memberRole.create({
      data: { membershipId: memberId, roleId },
    });

    const updatedMembership = await prisma.programMembership.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        memberRoles: { include: { role: true } },
      },
    });

    const memberRoles = updatedMembership!.memberRoles.map(mr => ({
      id: mr.role.id,
      name: mr.role.name,
      color: mr.role.color,
      tier: mr.role.tier,
    }));

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io) {
      io.to(`program:${programId}`).emit('member:role_changed', {
        programId,
        userId: updatedMembership!.user.id,
        roles: memberRoles,
      });
    }

    res.json({
      success: true,
      data: {
        member: {
          id: updatedMembership!.id,
          userId: updatedMembership!.user.id,
          displayName: updatedMembership!.user.displayName,
          avatarUrl: updatedMembership!.user.avatarUrl,
          roles: updatedMembership!.memberRoles.map(mr => ({
            ...mr.role,
            permissions: mr.role.permissions.toString(),
            tierName: TIER_NAMES[mr.role.tier],
          })),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// REMOVE ROLE FROM MEMBER
// ============================================

router.delete('/:programId/members/:memberId/roles/:roleId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { programId, memberId, roleId } = req.params;
    const userId = req.user!.id;

    const role = await prisma.role.findUnique({
      where: { id: roleId },
    });

    if (!role || role.programId !== programId) {
      throw new NotFoundError('Role not found');
    }

    if (role.isEveryone) {
      throw new BadRequestError('The @everyone role cannot be removed from members');
    }

    const membership = await prisma.programMembership.findUnique({
      where: { id: memberId },
    });

    if (!membership || membership.programId !== programId) {
      throw new NotFoundError('Member not found in this program');
    }

    const userPerms = await getUserPermissions(userId, programId, req.user!.isSuperAdmin);
    const ownerStatus = await isOwner(userId, programId);
    const userTier = await getUserLowestTier(userId, programId, req.user!.isSuperAdmin);

    if (!ownerStatus && !hasPermission(userPerms, Permissions.MANAGE_ROLES) && !req.user!.isSuperAdmin) {
      throw new ForbiddenError('You do not have permission to manage roles');
    }

    // Can only remove roles in tiers you can manage
    if (!req.user!.isSuperAdmin && !canManageTier(userTier, role.tier)) {
      throw new ForbiddenError(`You cannot remove ${TIER_NAMES[role.tier]} roles`);
    }

    const assignment = await prisma.memberRole.findUnique({
      where: { membershipId_roleId: { membershipId: memberId, roleId } },
    });

    if (!assignment) {
      throw new NotFoundError('This role is not assigned to this member');
    }

    await prisma.memberRole.delete({
      where: { id: assignment.id },
    });

    // Get updated membership with remaining roles
    const updatedMembership = await prisma.programMembership.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { id: true } },
        memberRoles: { include: { role: true } },
      },
    });

    const memberRoles = updatedMembership?.memberRoles.map(mr => ({
      id: mr.role.id,
      name: mr.role.name,
      color: mr.role.color,
      tier: mr.role.tier,
    })) || [];

    // Emit real-time event to all program members
    const io = req.app.get('io');
    if (io && updatedMembership) {
      io.to(`program:${programId}`).emit('member:role_changed', {
        programId,
        userId: updatedMembership.user.id,
        roles: memberRoles,
      });
    }

    res.json({
      success: true,
      message: 'Role removed from member successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// GET AVAILABLE PERMISSIONS (with tier info)
// ============================================

router.get('/permissions', authenticate, async (req: Request, res: Response) => {
  const permissionsList = [
    // Program Management (5)
    { key: 'ADMINISTRATOR', name: 'Administrator', description: 'Full access, bypasses all permission checks', category: 'Program', minTier: 1 },
    { key: 'MANAGE_PROGRAM', name: 'Manage Program', description: 'Edit program settings and manage privacy', category: 'Program', minTier: 1 },
    { key: 'MANAGE_ROLES', name: 'Manage Roles', description: 'Create, edit, delete, and assign roles', category: 'Program', minTier: 1 },
    { key: 'MANAGE_CHANNELS', name: 'Manage Channels', description: 'Create, edit, delete channels and categories', category: 'Program', minTier: 1 },
    { key: 'INVITE_MEMBERS', name: 'Invite Members', description: 'Generate invite codes and manage join requests', category: 'Program', minTier: 2 },
    // Channel Permissions (5)
    { key: 'SEND_MESSAGES', name: 'Send Messages', description: 'Post messages in text channels', category: 'Channel', minTier: 2 },
    { key: 'SEND_IN_ANNOUNCEMENTS', name: 'Post in Announcements', description: 'Post in announcement-only channels', category: 'Channel', minTier: 1 },
    { key: 'ATTACH_FILES', name: 'Attach Files', description: 'Upload images and files in messages', category: 'Channel', minTier: 2 },
    { key: 'MENTION_EVERYONE', name: 'Mention Everyone', description: 'Use @everyone and @role mentions', category: 'Channel', minTier: 2 },
    { key: 'MANAGE_MESSAGES', name: 'Manage Messages', description: 'Delete and pin/unpin any member\'s messages', category: 'Channel', minTier: 2 },
  ];

  res.json({
    success: true,
    data: { 
      permissions: permissionsList,
      tiers: Object.entries(TIER_NAMES).map(([tier, name]) => ({
        tier: parseInt(tier),
        name,
        description: tier === '0' ? 'Full control' : 
                     tier === '1' ? 'Full management capabilities' :
                     'Basic access, customizable with permissions',
      })),
    },
  });
});

// ============================================
// GET TIERS INFO
// ============================================

router.get('/tiers', authenticate, async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      tiers: [
        { tier: 0, name: 'Owner', description: 'Full control (program creator only)', canCreate: false },
        { tier: 1, name: 'Admin', description: 'Full management capabilities', canCreate: true },
        { tier: 2, name: 'Member', description: 'Basic access, customizable with permissions', canCreate: true },
      ],
    },
  });
});

export default router;
