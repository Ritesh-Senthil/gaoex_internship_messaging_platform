/**
 * Centralized access-control checks shared by REST routes and the Socket.io
 * layer. These answer "can this user *see* this resource?" — they are the
 * authorization gate for both HTTP reads and real-time room joins.
 *
 * Keep these in sync with the (richer) permission checks in the route handlers
 * for *mutations*; these are intentionally view-level (membership + private
 * channel + DM participation).
 */

import { prisma } from '../config/database';

/**
 * True if the user is a member of the program (super admins always pass).
 */
export async function canAccessProgram(
  userId: string,
  programId: string,
  isSuperAdmin = false,
): Promise<boolean> {
  if (isSuperAdmin) return true;
  const membership = await prisma.programMembership.findUnique({
    where: { userId_programId: { userId, programId } },
    select: { id: true },
  });
  return !!membership;
}

/**
 * True if the user can view a channel: must be a program member, and for
 * private channels must be tier 0–1 (owner/admin) or have an explicit
 * allow override (by user or by one of their roles).
 */
export async function canAccessChannel(
  userId: string,
  channelId: string,
  isSuperAdmin = false,
): Promise<boolean> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, programId: true, isPrivate: true },
  });
  if (!channel) return false;
  if (isSuperAdmin) return true;

  const membership = await prisma.programMembership.findUnique({
    where: { userId_programId: { userId, programId: channel.programId } },
    include: { memberRoles: { include: { role: { select: { id: true, tier: true } } } } },
  });
  if (!membership) return false;

  if (!channel.isPrivate) return true;

  // Private channel: owners/admins (tier 0–1) always have access.
  const userTier = membership.memberRoles.length
    ? Math.min(...membership.memberRoles.map((mr) => mr.role.tier))
    : 2;
  if (userTier <= 1) return true;

  // Otherwise require an explicit allow override (by user or role).
  const override = await prisma.permissionOverride.findFirst({
    where: {
      channelId,
      OR: [
        { userId },
        { roleId: { in: membership.memberRoles.map((mr) => mr.role.id) } },
      ],
      allow: { gt: BigInt(0) },
    },
    select: { id: true },
  });
  return !!override;
}

/**
 * True if the user is a participant in the conversation (DM/group).
 */
export async function canAccessConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { id: true },
  });
  return !!participant;
}
