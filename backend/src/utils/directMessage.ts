/**
 * Stable key for 1:1 conversations — sorted user IDs joined by ':'.
 * Used as a unique constraint so concurrent creates can't spawn duplicates (DAT-03).
 */
export function buildDirectMessageKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}
