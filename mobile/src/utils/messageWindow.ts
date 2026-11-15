/**
 * How a chat list absorbs a page from the server.
 * A historical window replaces the cache so the live tail is not spliced
 * onto older messages. A live page keeps unsent rows the server doesn't know.
 */

type Row = {
  id: string;
  clientId?: string | null;
  sendStatus?: string | null;
};

export function isPendingSend(row: Row): boolean {
  return row.id.startsWith('temp-') || row.sendStatus === 'sending' || row.sendStatus === 'failed';
}

export function withPendingSends<T extends Row>(cached: T[], page: T[]): T[] {
  const ids = new Set(page.map((row) => row.id));
  const clientIds = new Set(page.map((row) => row.clientId).filter((id): id is string => !!id));
  const pending = cached.filter((row) => {
    if (!isPendingSend(row) || ids.has(row.id)) return false;
    return !(row.clientId && clientIds.has(row.clientId));
  });
  return pending.length ? [...page, ...pending] : page;
}

/** Latest page keeps pending sends. A window that is not the live tail replaces the list. */
export function landOnPage<T extends Row>(cached: T[], page: T[], hasMoreNewer: boolean): T[] {
  if (hasMoreNewer) return page;
  return withPendingSends(cached, page);
}

export function appendUnique<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const ids = new Set(current.map((row) => row.id));
  const extra = incoming.filter((row) => !ids.has(row.id));
  return extra.length ? [...current, ...extra] : current;
}

export function newestServerId<T extends { id: string }>(items: T[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (!items[i].id.startsWith('temp-')) return items[i].id;
  }
  return undefined;
}
