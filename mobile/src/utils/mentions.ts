/**
 * Mention token helpers (PE-04)
 *
 * The channel composer shows mentions to the user as `@DisplayName` (multi-word
 * names are joined with a non-breaking space so they read as one token). On send
 * we convert those display names into *stable* tokens that survive renames and
 * name collisions:
 *   - user → `<@userId>`
 *   - role → `<@&roleId>`
 *
 * Resolution is done against the same member/role lists the autocomplete uses,
 * so a selected mention maps back to the exact id. `@everyone`/`@here` are left
 * as plain text — the backend handles them via MENTION_EVERYONE.
 */

import { MentionUser, MentionRole } from '../components/MentionAutocomplete';

const NBSP = '\u00A0';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace literal `@DisplayName` / `@RoleName` mentions in composer text with
 * stable `<@id>` / `<@&id>` tokens. Names are matched longest-first so
 * `@John Doe` is converted before `@John`.
 */
export function toMentionTokens(
  content: string,
  users: MentionUser[],
  roles: MentionRole[],
): string {
  const candidates: { needle: string; token: string }[] = [
    ...users.map((u) => ({
      needle: `@${u.displayName.replace(/ /g, NBSP)}`,
      token: `<@${u.id}>`,
    })),
    ...roles.map((r) => ({
      needle: `@${r.name.replace(/ /g, NBSP)}`,
      token: `<@&${r.id}>`,
    })),
  ].sort((a, b) => b.needle.length - a.needle.length);

  let result = content;
  for (const { needle, token } of candidates) {
    if (needle.length <= 1) continue; // empty name → skip
    // Negative lookahead prevents matching a shorter name inside a longer one
    // (e.g. "@Jo" must not clobber the start of "@John").
    const re = new RegExp(`${escapeRegExp(needle)}(?![\\w${NBSP}])`, 'g');
    result = result.replace(re, token);
  }
  return result;
}
