/**
 * Picks which message ids a chat list should return.
 *
 * The latest page and "load earlier" (`before`) stay the pages the apps
 * already use. `around` opens a notification on an older message without
 * splicing that message onto the live tail. `after` is the next page toward
 * the live tail (oldest first), which is what scrolling down from that window
 * needs.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MessageWindow = {
  /** Chronological message ids. */
  ids: string[];
  hasMoreOlder: boolean;
  hasMoreNewer: boolean;
  /**
   * False only when the caller asked for a specific message and it is not in
   * this list (deleted, or it belongs to a different chat). The ids are then
   * the latest page, so the client can open the chat without an error.
   */
  anchored: boolean;
};

export function parseTake(limit: unknown, fallback = 50): number {
  const raw = typeof limit === 'string' ? limit : typeof limit === 'number' ? String(limit) : '';
  const parsed = raw ? parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
}

export function queryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) return value[0];
  return undefined;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function validDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Center `targetId` in a page of `take` ids.
 * `olderDesc` is newest-first and `newerAsc` is oldest-first. Each list is the
 * rows fetched for that side (at most `take`). Spare slots from a short side
 * are filled from the other side so a message near the edge still gets a full
 * page when the history is there.
 */
export function assembleAroundWindow(input: {
  targetId: string;
  olderDesc: string[];
  newerAsc: string[];
  take: number;
}): { ids: string[]; hasMoreOlder: boolean; hasMoreNewer: boolean } {
  const take = Math.max(1, input.take);
  const olderBudget = Math.floor((take - 1) / 2);
  const newerBudget = take - 1 - olderBudget;
  let olderUse = Math.min(olderBudget, input.olderDesc.length);
  let newerUse = Math.min(newerBudget, input.newerAsc.length);
  let spare = take - 1 - olderUse - newerUse;
  if (spare > 0 && input.olderDesc.length > olderUse) {
    const give = Math.min(spare, input.olderDesc.length - olderUse);
    olderUse += give;
    spare -= give;
  }
  if (spare > 0 && input.newerAsc.length > newerUse) {
    const give = Math.min(spare, input.newerAsc.length - newerUse);
    newerUse += give;
  }
  return {
    ids: [
      ...input.olderDesc.slice(0, olderUse).reverse(),
      input.targetId,
      ...input.newerAsc.slice(0, newerUse),
    ],
    hasMoreOlder: input.olderDesc.length > olderUse,
    hasMoreNewer: input.newerAsc.length > newerUse,
  };
}

export function orderByIds<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered: T[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (row) ordered.push(row);
  }
  return ordered;
}

async function idsDescending(where: Prisma.MessageWhereInput, take: number): Promise<string[]> {
  const rows = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function olderThan(base: Prisma.MessageWhereInput, createdAt: Date, id: string): Prisma.MessageWhereInput {
  return {
    AND: [
      base,
      {
        OR: [
          { createdAt: { lt: createdAt } },
          { AND: [{ createdAt }, { id: { lt: id } }] },
        ],
      },
    ],
  };
}

function newerThan(base: Prisma.MessageWhereInput, createdAt: Date, id: string): Prisma.MessageWhereInput {
  return {
    AND: [
      base,
      {
        OR: [
          { createdAt: { gt: createdAt } },
          { AND: [{ createdAt }, { id: { gt: id } }] },
        ],
      },
    ],
  };
}

async function latestPage(base: Prisma.MessageWhereInput, take: number, anchored: boolean): Promise<MessageWindow> {
  const idsDesc = await idsDescending(base, take);
  return {
    ids: [...idsDesc].reverse(),
    hasMoreOlder: idsDesc.length === take,
    hasMoreNewer: false,
    anchored,
  };
}

export async function selectMessageWindow(args: {
  where: Prisma.MessageWhereInput;
  take: number;
  before?: string;
  after?: string;
  around?: string;
}): Promise<MessageWindow> {
  const take = parseTake(args.take);
  const base = args.where;

  // Pagination cursors win over the initial around request. A client never
  // sends them together; if it does, the cursor is the page it asked for.
  if (args.before) {
    const cursor = validDate(args.before);
    if (!cursor) return latestPage(base, take, true);
    const idsDesc = await idsDescending(
      { AND: [base, { createdAt: { lt: cursor } }] },
      take,
    );
    return {
      ids: [...idsDesc].reverse(),
      hasMoreOlder: idsDesc.length === take,
      hasMoreNewer: false,
      anchored: true,
    };
  }

  if (args.after) {
    if (isUuid(args.after)) {
      const cursor = await prisma.message.findFirst({
        where: { AND: [base, { id: args.after }] },
        select: { id: true, createdAt: true },
      });
      // The boundary message is gone. An empty newer page tells the client to
      // reload the live tail instead of appending a hole.
      if (!cursor) {
        return { ids: [], hasMoreOlder: true, hasMoreNewer: false, anchored: true };
      }
      const rows = await prisma.message.findMany({
        where: newerThan(base, cursor.createdAt, cursor.id),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: take + 1,
        select: { id: true },
      });
      const hasMoreNewer = rows.length > take;
      return {
        ids: rows.slice(0, take).map((row) => row.id),
        hasMoreOlder: true,
        hasMoreNewer,
        anchored: true,
      };
    }

    const cursor = validDate(args.after);
    if (!cursor) return latestPage(base, take, true);
    const rows = await prisma.message.findMany({
      where: { AND: [base, { createdAt: { gt: cursor } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      select: { id: true },
    });
    return {
      ids: rows.slice(0, take).map((row) => row.id),
      hasMoreOlder: true,
      hasMoreNewer: rows.length > take,
      anchored: true,
    };
  }

  if (args.around) {
    if (!isUuid(args.around)) return latestPage(base, take, false);
    const target = await prisma.message.findFirst({
      where: { AND: [base, { id: args.around }] },
      select: { id: true, createdAt: true },
    });
    if (!target) return latestPage(base, take, false);

    const latestIds = await idsDescending(base, take);
    if (latestIds.includes(target.id)) {
      return {
        ids: [...latestIds].reverse(),
        hasMoreOlder: latestIds.length === take,
        hasMoreNewer: false,
        anchored: true,
      };
    }

    const [olderDesc, newerAsc] = await Promise.all([
      idsDescending(olderThan(base, target.createdAt, target.id), take),
      prisma.message.findMany({
        where: newerThan(base, target.createdAt, target.id),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take,
        select: { id: true },
      }).then((rows) => rows.map((row) => row.id)),
    ]);
    const window = assembleAroundWindow({
      targetId: target.id,
      olderDesc,
      newerAsc,
      take,
    });
    return { ...window, anchored: true };
  }

  return latestPage(base, take, true);
}
