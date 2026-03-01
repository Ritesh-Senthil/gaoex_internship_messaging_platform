/**
 * Shared role/permission helpers used across multiple route files.
 * Extracted from role.routes.ts to avoid circular imports.
 */

import { prisma } from '../config/database';
import {
  Permissions,
  PermissionPresets,
  combineRolePermissions,
} from './permissions';

// ============================================
// TIER DEFINITIONS (mirrored from role.routes)
// ============================================

export const ROLE_TIERS = {
  OWNER: 0,
  ADMIN: 1,
  MEMBER: 2,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get user's lowest tier (most authority) in a program.
 * Lower tier number = more authority.
 * Super Admin always has Owner tier (0).
 */
export async function getUserLowestTier(
  userId: string,
  programId: string,
  isSuperAdmin = false,
): Promise<number> {
  if (isSuperAdmin) return ROLE_TIERS.OWNER;

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });

  if (program?.ownerId === userId) return ROLE_TIERS.OWNER;

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
 * Get user's combined permissions in a program.
 * Super Admin / program owner always has all permissions.
 */
export async function getUserPermissions(
  userId: string,
  programId: string,
  isSuperAdmin = false,
): Promise<bigint> {
  if (isSuperAdmin) return PermissionPresets.ALL;

  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });

  if (program?.ownerId === userId) return PermissionPresets.ALL;

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
 * Check if user is the program owner.
 */
export async function isOwner(userId: string, programId: string): Promise<boolean> {
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { ownerId: true },
  });
  return program?.ownerId === userId;
}
