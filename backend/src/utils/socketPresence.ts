/**
 * Tracks which user owns each socket and exposes room membership lookups.
 * Used for presence, multi-device checks, and suppressing push notifications
 * for users actively viewing a channel/conversation.
 */

import type { Server } from 'socket.io';

export interface SocketAuth {
  userId: string;
  isSuperAdmin: boolean;
}

let io: Server | null = null;
const socketUserMap = new Map<string, SocketAuth>();

export function initSocketPresence(server: Server): void {
  io = server;
}

export function registerSocketUser(socketId: string, auth: SocketAuth): void {
  socketUserMap.set(socketId, auth);
}

export function unregisterSocketUser(socketId: string): void {
  socketUserMap.delete(socketId);
}

export function getSocketUser(socketId: string): SocketAuth | undefined {
  return socketUserMap.get(socketId);
}

export function userHasOtherSockets(userId: string, exceptSocketId?: string): boolean {
  for (const [socketId, auth] of socketUserMap) {
    if (socketId === exceptSocketId) continue;
    if (auth.userId === userId) return true;
  }
  return false;
}

/** User IDs with at least one socket currently joined to the given room. */
export async function getUserIdsActiveInRoom(room: string): Promise<Set<string>> {
  const userIds = new Set<string>();
  if (!io) return userIds;

  try {
    const sockets = await io.in(room).fetchSockets();
    for (const socket of sockets) {
      const auth = socketUserMap.get(socket.id);
      if (auth) userIds.add(auth.userId);
    }
  } catch (error) {
    console.error(`[Socket] Failed to fetch sockets in room ${room}:`, error);
  }

  return userIds;
}
