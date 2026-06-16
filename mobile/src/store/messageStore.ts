/**
 * Central message cache (ST-01).
 *
 * A single source of truth for the message arrays that chat screens render,
 * keyed by a stable string:
 *   - `channel:<channelId>`
 *   - `conversation:<conversationId>`
 *   - `thread:<parentMessageId>`
 *
 * Why: previously each screen held messages in local `useState`, so navigating
 * away and back refetched from scratch and real-time socket merges had no shared
 * home. Caching here gives instant back-navigation (render cached, refetch in the
 * background) and a foundation for optimistic send (UX-01) and reconnect gap-fill
 * (RT-01).
 *
 * Migration design: `setMessages(key, valueOrUpdater)` mirrors React's
 * `setState` signature, so screens (and hooks like `useReactions`/`useMessageEdit`
 * that expect a `setMessages` dispatcher) can adopt the cache with minimal churn.
 */

import { create } from 'zustand';
import { Message, DMMessage, ThreadMessage } from '../types';

export type ChatMessage = Message | DMMessage | ThreadMessage;

type Updater<T> = T[] | ((prev: T[]) => T[]);

/**
 * Max number of distinct cache keys (channels/conversations/threads) kept in
 * memory. Beyond this, the least-recently-used slices are evicted so the cache
 * can't grow without bound across a long session (ST-01).
 */
const MAX_CACHED_KEYS = 12;

interface MessageStoreState {
  slices: Record<string, ChatMessage[]>;
  /** Keys ordered least- → most-recently accessed; drives LRU eviction. */
  lru: string[];
  /** Replace or transform the cached messages for a key (React setState-style). */
  setMessages: <T extends ChatMessage>(key: string, value: Updater<T>) => void;
  /** Mark a key as most-recently used (e.g. on screen focus) without writing. */
  touchKey: (key: string) => void;
  /** Drop a key's cache (e.g. when it should be force-refetched). */
  clearKey: (key: string) => void;
  /** Wipe the entire message cache (logout / account switch). */
  clearAll: () => void;
}

/** A slice is "pinned" (never evicted) while it holds an optimistic/pending message. */
function sliceHasPending(slice: ChatMessage[] | undefined): boolean {
  if (!slice || slice.length === 0) return false;
  return slice.some((m) => m.clientId != null || (typeof m.id === 'string' && m.id.startsWith('temp-')));
}

/** Move `key` to the most-recently-used end of the access order. */
function bumpLru(lru: string[], key: string): string[] {
  return [...lru.filter((k) => k !== key), key];
}

/**
 * Evict least-recently-used slices once the key count exceeds the cap. Slices
 * containing an in-flight optimistic message are skipped (never dropped), so a
 * pending send is never lost to eviction.
 */
function evict(slices: Record<string, ChatMessage[]>, lru: string[]) {
  const overflow = lru.length - MAX_CACHED_KEYS;
  if (overflow <= 0) return { slices, lru };

  const nextSlices = { ...slices };
  const removed = new Set<string>();
  let dropped = 0;
  // lru is ordered least-recent first.
  for (let i = 0; i < lru.length && dropped < overflow; i++) {
    const key = lru[i];
    if (sliceHasPending(nextSlices[key])) continue;
    delete nextSlices[key];
    removed.add(key);
    dropped++;
  }
  if (removed.size === 0) return { slices, lru };
  return { slices: nextSlices, lru: lru.filter((k) => !removed.has(k)) };
}

export const useMessageStore = create<MessageStoreState>((set) => ({
  slices: {},
  lru: [],

  setMessages: (key, value) =>
    set((state) => {
      const current = (state.slices[key] ?? []) as any[];
      const next = typeof value === 'function' ? (value as (p: any[]) => any[])(current) : value;
      const slices = { ...state.slices, [key]: next as ChatMessage[] };
      return evict(slices, bumpLru(state.lru, key));
    }),

  touchKey: (key) =>
    set((state) => {
      if (!(key in state.slices)) return state;
      return { lru: bumpLru(state.lru, key) };
    }),

  clearKey: (key) =>
    set((state) => {
      if (!(key in state.slices)) return state;
      const slices = { ...state.slices };
      delete slices[key];
      return { slices, lru: state.lru.filter((k) => k !== key) };
    }),

  clearAll: () => set({ slices: {}, lru: [] }),
}));

/** Generate a client-side nonce for optimistic-send reconciliation (UX-01). */
export function newClientId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Stable empty reference so screens with no cached slice don't re-render in a loop.
const EMPTY: ChatMessage[] = [];

/** Subscribe to the cached messages for a key (typed to the caller's message type). */
export function useCachedMessages<T extends ChatMessage>(key: string): T[] {
  return useMessageStore((s) => (s.slices[key] as T[] | undefined) ?? (EMPTY as T[]));
}

/** Imperative read — true if a key already has cached messages (avoids a load spinner). */
export function hasCachedMessages(key: string): boolean {
  return (useMessageStore.getState().slices[key]?.length ?? 0) > 0;
}

/** Imperative dispatcher for code outside React (e.g. global socket handlers). */
export function setCachedMessages<T extends ChatMessage>(key: string, value: Updater<T>): void {
  useMessageStore.getState().setMessages(key, value);
}

/**
 * Insert or reconcile a single message into a list (UX-01).
 *
 * Matches an existing entry by `clientId` first (so a server echo — via REST
 * response or socket — replaces the optimistic placeholder regardless of which
 * arrives first), then falls back to `id`. If neither matches, the message is
 * appended (assumed newest). Returns the same array reference when nothing
 * changes so selectors don't needlessly re-render.
 */
export function upsertMessage<T extends ChatMessage>(list: T[], incoming: T): T[] {
  let idx = -1;
  if (incoming.clientId) {
    idx = list.findIndex((m) => m.clientId && m.clientId === incoming.clientId);
  }
  if (idx === -1) {
    idx = list.findIndex((m) => m.id === incoming.id);
  }

  let next: T[];
  let targetIdx: number;
  if (idx === -1) {
    next = [...list, incoming];
    targetIdx = next.length - 1;
  } else {
    next = list.slice();
    targetIdx = idx;
    next[targetIdx] = incoming;
  }

  // Guarantee a single entry per final id: a concurrent catch-up fetch (which
  // carries no clientId) could have appended a separate copy of this message
  // before the echo reconciled the optimistic placeholder by clientId.
  if (next.some((m, i) => i !== targetIdx && m.id === incoming.id)) {
    next = next.filter((m, i) => i === targetIdx || m.id !== incoming.id);
  }
  return next;
}

/**
 * Merge freshly-fetched messages into an existing list, deduped by `id` and
 * sorted chronologically (oldest → newest). Incoming copies win, so edits,
 * reactions, and pin changes that happened while away are picked up. Used by
 * the reconnect / refocus catch-up (RT-01).
 *
 * Note: this only adds/updates — it does not remove messages deleted while the
 * client was away (live deletions are handled by socket `*_deleted` events).
 */
export function mergeMessagesById<T extends ChatMessage>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<string, T>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  if (byId.size === existing.length) {
    // Same set of ids — incoming only updated existing rows; keep current order.
    return existing.map((m) => byId.get(m.id) as T);
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/** A locally-created optimistic/pending placeholder that must never be pruned or replaced. */
function isPendingMessage(m: ChatMessage): boolean {
  return m.clientId != null || (typeof m.id === 'string' && m.id.startsWith('temp-'));
}

export interface CatchUpResult<T extends ChatMessage> {
  messages: T[];
  /**
   * True when a non-contiguous gap was detected: more than the fetched page
   * arrived while away, so the cache and the fetched page don't connect. The
   * caller should set `hasMore=true` so the user can scroll up to backfill.
   */
  gap: boolean;
}

/**
 * Reconcile a freshly-fetched latest page against the cache for the reconnect /
 * refocus catch-up (RT-01). Extends `mergeMessagesById` with two cases the plain
 * additive merge can't handle:
 *
 * 1. Gap-fill: if there's no id overlap and the entire fetched page is newer than
 *    the newest cached real (non-pending) message, then more than a page arrived
 *    while away and the missing middle can't be shown contiguously. We reset to the
 *    fetched page (keeping any in-flight optimistic messages) and report `gap=true`
 *    so the caller re-enables "load earlier" instead of presenting a broken list.
 *
 * 2. Prune away-deletes: within the contiguous window the fetch actually covers
 *    (oldest fetched `createdAt` → now), any cached message the server no longer
 *    returns was deleted while away, so it's removed. Messages older than the
 *    window (outside the fetch's coverage) and pending/optimistic messages are
 *    never pruned.
 *
 * When the fetched page overlaps the cache by id, the additive merge is kept
 * (plus the prune), so the common "<50 new messages" case is unchanged.
 */
export function reconcileCatchUp<T extends ChatMessage>(existing: T[], fetched: T[]): CatchUpResult<T> {
  if (fetched.length === 0) return { messages: existing, gap: false };
  if (existing.length === 0) return { messages: fetched, gap: false };

  const fetchedIds = new Set(fetched.map((m) => m.id));
  const hasOverlap = existing.some((m) => fetchedIds.has(m.id));

  // Newest cached real (non-pending) message anchors gap detection.
  let newestCachedRealAt = -Infinity;
  for (const m of existing) {
    if (isPendingMessage(m)) continue;
    const t = new Date(m.createdAt).getTime();
    if (t > newestCachedRealAt) newestCachedRealAt = t;
  }

  // Oldest fetched message anchors the contiguous window the page covers.
  let windowStart = Infinity;
  for (const m of fetched) {
    const t = new Date(m.createdAt).getTime();
    if (t < windowStart) windowStart = t;
  }

  // Gap: nothing overlaps and the whole fetched page is newer than everything
  // cached, so the missing middle can't be bridged. Reset to the fetched page and
  // preserve in-flight optimistic messages (they belong after the fetched range).
  const gap = !hasOverlap && newestCachedRealAt !== -Infinity && windowStart > newestCachedRealAt;
  if (gap) {
    const pending = existing.filter(isPendingMessage);
    return { messages: [...fetched, ...pending], gap: true };
  }

  // Additive merge (picks up edits/reactions/pins/new rows), then prune any cached
  // message inside the covered window that the server no longer returns.
  const merged = mergeMessagesById(existing, fetched);
  const pruned = merged.filter((m) => {
    if (isPendingMessage(m)) return true;
    if (fetchedIds.has(m.id)) return true;
    return new Date(m.createdAt).getTime() < windowStart;
  });
  return { messages: pruned, gap: false };
}
