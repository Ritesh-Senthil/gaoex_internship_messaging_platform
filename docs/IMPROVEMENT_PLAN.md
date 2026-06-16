# InternHub — Master Improvement Plan

> **Created:** June 10, 2026
> **Purpose:** Single source of truth for everything we want to fix or improve, from security holes to iOS polish.
> **Benchmark:** Slack / Discord / iMessage production quality.
> **Companion docs:** [ARCHITECTURE.md](./ARCHITECTURE.md), [CHECKPOINT.md](./CHECKPOINT.md), [API.md](./API.md)

---

## How to use this document

This is a **backlog + tracker**, not a script to run top-to-bottom. Each item has a **stable ID** (e.g. `SEC-01`) that never changes, so we can reference it in commits/PRs ("fixes SEC-01") and in conversation.

**Execution model (read this):**
- Work in **dependency- and severity-order**, not list order. The "Execution roadmap" at the bottom is the actual order we follow.
- Each item should become **one focused commit/PR** with its acceptance criteria met.
- When an item is done, update its **Status** here and add a line to the **Changelog** at the bottom.
- Don't start a Phase 3 (polish) item if a Phase 1 (security/correctness) item it depends on is still open.

**Status legend:** `TODO` · `IN PROGRESS` · `BLOCKED` · `DONE` · `WONTFIX`
**Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low
**Effort:** S (≤½ day) · M (½–2 days) · L (2–5 days) · XL (>1 week)

---

## Master index

| ID | Title | Sev | Phase | Effort | Status |
|----|-------|-----|-------|--------|--------|
| **SEC-01** | Remove socket raw-userId auth fallback | 🔴 | 1 | S | DONE |
| **SEC-02** | Authorize socket room joins server-side | 🔴 | 1 | M | DONE |
| **SEC-03** | Enforce private-channel + send perms on POST/upload | 🟠 | 1 | M | DONE |
| **SEC-04** | Enforce `MENTION_EVERYONE` permission | 🟡 | 1 | S | DONE |
| **SEC-05** | Re-check membership on message edit/delete | 🟡 | 1 | S | DONE |
| **SEC-06** | Wire rate limiting (auth + messages) | 🟠 | 1 | S | DONE |
| **SEC-07** | Add Zod validation on all write endpoints | 🟡 | 1 | M | PARTIAL |
| **SEC-08** | Scope `/users/search` + stop leaking emails | 🟡 | 1 | S | DONE |
| **SEC-09** | Harden config: fail on missing secrets in prod | 🟡 | 1 | S | DONE |
| **SEC-10** | Use `computePermissions` overrides or remove dead model | 🟡 | 2 | M | TODO |
| **DAT-01** | Wrap message-send side effects in a transaction | 🟠 | 1 | M | DONE |
| **DAT-02** | Make thread `replyCount` updates atomic | 🟡 | 1 | S | DONE |
| **DAT-03** | Prevent duplicate 1:1 conversations | 🟡 | 2 | S | TODO |
| **RT-01** | Reliable delivery: reconnect gap-fill / refetch on focus | 🟠 | 2 | L | PARTIAL |
| **RT-02** | Replace client-side `excludeSocketIds` unread filtering | 🟡 | 2 | M | TODO |
| **RT-03** | Route upload messages through unread + push pipeline | 🟠 | 1 | S | DONE |
| **RT-04** | Add Redis adapter for Socket.io (multi-instance) | 🟡 | 2 | M | TODO |
| **PE-01** | Add Postgres full-text / trigram search index | 🟡 | 2 | M | TODO |
| **PE-02** | Fix `scope=all` search result-merging correctness | 🟡 | 2 | S | TODO |
| **PE-03** | Fix N+1 on conversation unread counts | 🟡 | 2 | S | DONE |
| **PE-04** | Stable mention tokens (`<@id>`) instead of name regex | 🟡 | 2 | M | TODO |
| **ST-01** | Central message cache (no refetch on back-nav) | 🟠 | 2 | L | DONE |
| **ST-02** | Make `ProgramDetailScreen` use `channelStore` | ⚪ | 2 | S | TODO |
| **ST-03** | Extract shared chat-screen architecture | 🟡 | 2 | L | TODO |
| **UX-01** | Optimistic send (clientId + pending/failed/retry) | 🔴 | 3 | L | PARTIAL |
| **UX-02** | Optimistic reactions | 🟡 | 3 | S | DONE |
| **UX-03** | List perf: FlashList + memoized rows + tuning | 🟠 | 3 | M | TODO |
| **UX-04** | Preserve scroll position on history load | 🟠 | 3 | M | DONE |
| **UX-05** | Fix ScrollToBottomFAB fade-out animation | ⚪ | 3 | S | TODO |
| **UX-06** | Channel typing indicators | 🟡 | 3 | S | DONE |
| **UX-07** | Haptics across messaging interactions | 🟡 | 3 | S | DONE |
| **UX-08** | Full emoji picker + "who reacted" | 🟡 | 3 | M | TODO |
| **UX-09** | Better edit UX + edit in threads | 🟡 | 3 | M | TODO |
| **UX-10** | Skeleton loaders instead of spinners | 🟡 | 3 | M | TODO |
| **UX-11** | Native context menus + toast feedback | 🟡 | 3 | M | TODO |
| **UX-12** | Consistent draft-restore on send failure | ⚪ | 3 | S | TODO |
| **UX-13** | Fix mention autocomplete cursor/index bugs | 🟡 | 1 | S | DONE |
| **UX-14** | Robust keyboard handling (drop magic offset) | ⚪ | 3 | S | TODO |
| **PR-01** | Reconsider Programs-first IA for single-program use | 🟡 | 2 | M | TODO |
| **PR-02** | Simplify role/permission model for the audience | 🟡 | 2 | M | TODO |
| **PR-03** | Feature-floor pressure test | ⚪ | 2 | S | TODO |
| **DS-01** | Define text-style tokens / typographic scale | 🟡 | 2 | M | TODO |
| **DS-02** | Develop brand identity (use the accent) | 🟡 | 2 | M | TODO |
| **DS-03** | Enforce design tokens, reduce inline styles | ⚪ | 2 | L | TODO |
| **DS-04** | Light mode | ⚪ | 4 | L | TODO |
| **INF-01** | Fix access-token `expiresIn` config mismatch | ⚪ | 1 | S | DONE |
| **INF-02** | Remove dead `JWT_REFRESH_SECRET` config | ⚪ | 2 | S | TODO |
| **INF-03** | Schedule `cleanupExpiredTokens` job | ⚪ | 2 | S | TODO |
| **INF-04** | Validate Firebase creds at startup | ⚪ | 1 | S | DONE |
| **INF-05** | Mobile: refresh token + re-auth socket on `auth_error` | 🟠 | 1 | S | DONE |

---

## 1. Security & authorization (Phase 1 — do first)

### SEC-01 · Remove socket raw-userId auth fallback 🔴
- **Problem:** `socket.on('authenticate')` falls back to trusting a raw user ID if JWT verification fails, with no `NODE_ENV` guard. Anyone with a user UUID can impersonate them on the socket.
- **Files:** `backend/src/index.ts:113-123`
- **Fix:** Require a valid JWT; on failure, emit an `auth_error` and disconnect. Prefer authenticating in the connection handshake (`io.use(...)` middleware) over a post-connect event.
- **Done when:** A socket with an invalid/absent token cannot join `user:*` or be marked online; verified by a test connecting with a bogus token.

### SEC-02 · Authorize socket room joins server-side 🔴
- **Problem:** `join_program` / `join_channel` / `join_conversation` join any room by ID with no membership/ACL check — IDOR over WebSocket; bypasses private-channel REST ACLs.
- **Files:** `backend/src/index.ts:180-213`
- **Fix:** On each join, verify the authenticated user is a member/participant (and passes private-channel access). Reject otherwise. Ideally derive joinable rooms server-side from membership rather than trusting client requests.
- **Depends on:** SEC-01.
- **Done when:** A user cannot receive `new_message` for a channel/conversation/program they don't belong to.

### SEC-03 · Enforce private-channel + send perms on POST/upload 🟠
- **Problem:** Private-channel access is checked on `GET` but not on `POST /messages` or file upload; `SEND_MESSAGES`/`ATTACH_FILES`/announcement checks are inconsistent across paths.
- **Files:** `backend/src/routes/channel.routes.ts` (POST), `backend/src/routes/upload.routes.ts`
- **Fix:** Extract a single `assertCanPostToChannel(userId, channel)` helper and call it from every message/upload/reaction path.
- **Done when:** Posting/uploading to a private channel without access returns 403 on every route.

### SEC-04 · Enforce `MENTION_EVERYONE` permission 🟡
- **Problem:** `@everyone`/`@here` set `mentionEveryone=true` without checking the permission.
- **Files:** `backend/src/routes/channel.routes.ts:347-349`
- **Fix:** Only honor the flag if `hasPermission(userPerms, Permissions.MENTION_EVERYONE)`; otherwise treat as literal text.

### SEC-05 · Re-check membership on message edit/delete 🟡
- **Problem:** `PATCH` message checks author only, no membership re-check (a removed member could still edit).
- **Files:** `backend/src/routes/channel.routes.ts` (PATCH/DELETE)
- **Fix:** Add membership + channel-access check alongside the author check.

### SEC-06 · Wire rate limiting 🟠
- **Problem:** `express-rate-limit` is a dependency and config exists, but no limiter is mounted.
- **Files:** `backend/src/index.ts`, `backend/src/config/index.ts:44-53`
- **Fix:** Mount a global limiter and a stricter limiter on `/auth/*` and message-send routes.

### SEC-07 · Add Zod validation on write endpoints 🟡 — **PARTIAL**
- **Problem:** All validation is hand-rolled; `zod` is installed but unused. Inconsistent length caps (DM messages uncapped vs 4000 for channels).
- **Files:** all `backend/src/routes/*.ts`
- **Fix:** Define Zod schemas per endpoint; validate body/query in a thin middleware; the `ZodError` handler already exists in `errorHandler.ts`.
- **Done so far:** Added `validateBody()` middleware (`backend/src/middleware/validate.ts`) and applied it to the highest-risk write paths: channel send + edit, DM send, `auth/firebase`, `auth/refresh`. DM messages now capped at 4000 (parity with channels). `users PATCH /me` and `push-token` retain their existing thorough inline validation.
- **Remaining:** Migrate program/role/category/channel-management and reaction write endpoints to Zod schemas. Tracked as the rest of SEC-07.

### SEC-08 · Scope `/users/search` + stop leaking emails 🟡
- **Problem:** Global user search returns emails for any authenticated user.
- **Files:** `backend/src/routes/user.routes.ts`
- **Fix:** Scope results to users sharing a program with the caller; drop `email` from the payload unless needed.

### SEC-09 · Harden config: fail on missing secrets in prod 🟡
- **Problem:** JWT secrets default to `'dev-access-secret'`; production `validateConfig` doesn't cover all required secrets.
- **Files:** `backend/src/config/index.ts:19,57-70`
- **Fix:** In production, throw if any auth secret is missing/equals a dev default.

### SEC-10 · Use override permissions or remove the dead model 🟡
- **Problem:** `computePermissions` (category→channel allow/deny resolution) is never called; real checks use a simplified "any allow > 0" heuristic. Half the permission model is decorative.
- **Files:** `backend/src/utils/permissions.ts:103-121`, `backend/src/routes/program.routes.ts`
- **Decision needed:** Either implement full override resolution everywhere, OR simplify the model (see PR-02) and delete the unused code. **Tie to PR-02.**

---

## 2. Data integrity

### DAT-01 · Wrap message-send side effects in a transaction 🟠
- **Problem:** Message create + parent `replyCount` + `channelRead` mention bumps + conversation `updatedAt` are separate awaits; partial failure corrupts counters/unread state.
- **Files:** `backend/src/routes/channel.routes.ts`, `backend/src/routes/conversation.routes.ts`
- **Fix:** Wrap the write set in `prisma.$transaction`. Emit socket events only after commit.
- **Done when:** A forced mid-sequence error leaves no orphaned counters.

### DAT-02 · Make thread `replyCount` atomic 🟡
- **Problem:** TOCTOU between parent validation and `increment` under concurrent replies.
- **Fix:** Do the increment inside the same transaction as DAT-01; rely on atomic `increment`.

### DAT-03 · Prevent duplicate 1:1 conversations 🟡
- **Problem:** Two users can each create a 1:1 conversation; no uniqueness guard on the participant pair.
- **Fix:** Add a deterministic conversation key for 1:1 (sorted participant pair) or an existence check inside a transaction.

---

## 3. Real-time & delivery

### RT-01 · Reliable delivery / reconnect sync 🟠 — **PARTIAL**
- **Problem:** Write-then-emit with no outbox or gap-fill; clients can silently miss messages across reconnect windows.
- **Fix (pragmatic):** On socket reconnect and on screen focus, refetch messages since the last known message timestamp/ID and merge. (Full outbox/event-log is overkill at this scale.)
- **Depends on:** ST-01 (cache) makes this clean.
- **Done so far:** `ChannelScreen` + `ConversationScreen` now run a background `catchUp()` — refetch the latest page and `mergeMessagesById()` into the cache (dedupes, picks up edits/reactions/pins, no spinner, never yanks scroll) — triggered on (a) screen re-focus (first focus skipped; the initial load covers it) and (b) a genuine socket reconnect after a drop (initial connect doesn't double-fetch). `mergeMessagesById` lives in `messageStore.ts`.
- **Remaining:** (1) Gaps larger than one page (>50 messages missed while away) leave a hole between the cached tail and the latest page — acceptable at this scale but could be closed with an `after`-cursor loop. (2) Messages deleted while away aren't pruned by catch-up (live deletes still handled by socket events). (3) `ThreadScreen` not yet covered. (4) Could add an explicit `since`/`after` server param path for efficiency instead of refetching 50.

### RT-02 · Replace client-side `excludeSocketIds` unread filtering 🟡
- **Problem:** Unread/mention correctness depends on the client filtering broadcasts by socket ID — racy.
- **Fix:** Emit unread/badge events only to the intended recipients' `user:` rooms with server-computed counts.

### RT-03 · Route upload messages through unread + push 🟠
- **Problem:** File-only messages skip mention parsing, unread sockets, and push — no notification/badge.
- **Files:** `backend/src/routes/upload.routes.ts`
- **Fix:** Reuse the same post-send pipeline as text messages (extract a shared `afterMessageCreated()` helper). **Pairs with DAT-01.**

### RT-04 · Redis adapter for Socket.io 🟡
- **Problem:** Single-process rooms break on multi-instance deploys/scaling.
- **Fix:** Add `@socket.io/redis-adapter` backed by a managed Redis. Plan before scaling past one instance.

---

## 4. Backend performance & correctness

### PE-01 · Full-text / trigram search index 🟡
- **Problem:** Search is unindexed `ILIKE '%term%'`.
- **Fix:** Add a `tsvector` column + GIN index (or `pg_trgm`) and query it; migrate `search.routes.ts`.

### PE-02 · Fix `scope=all` search merge 🟡
- **Problem:** Fetches N channel + N DM results separately then slices — can miss global best matches; inaccurate `total`/`hasMore`.
- **Fix:** Single ranked query across both sources, or correct merge + accurate counts.

### PE-03 · Fix N+1 conversation unread counts 🟡 — **DONE**
- **Problem:** One `message.count` per conversation when listing.
- **Files:** `backend/src/routes/conversation.routes.ts`
- **Fix:** Single grouped/aggregate query for unread counts.
- **DONE:** Replaced the per-conversation `message.count` loop with one `$queryRaw` that joins each user's `ConversationParticipant.lastReadAt` and `GROUP BY "conversationId"` (`COUNT(*)::int`, excludes own messages). Conversations-list load now issues a constant number of queries regardless of conversation count.

### PE-04 · Stable mention tokens 🟡
- **Problem:** Mentions matched by display-name regex against all members per send — O(members) and spoofable (duplicate names).
- **Fix:** Store mentions as `<@userId>` tokens in content; resolve names at render time. **Touches mobile MessageInput + MarkdownText (UX-13).**

---

## 5. Mobile state & architecture

### ST-01 · Central message cache 🟠 — **DONE**
- **Problem:** Messages live in per-screen `useState`; back-navigation refetches; real-time merges have no shared home.
- **Fix:** Introduce a message store (Zustand slice keyed by channel/conversation/thread, or TanStack Query). Foundation for UX-01 and RT-01.
- **DONE:** Added `mobile/src/store/messageStore.ts` — a Zustand cache keyed by `channel:<id>` / `conversation:<id>` / `thread:<id>`, exposing a `setMessages(key, valueOrUpdater)` dispatcher that mirrors React's `setState` so screens and the `useReactions`/`useMessageEdit` hooks adopt it with near-zero churn. **All three chat screens migrated:** `ChannelScreen`, `ConversationScreen`, and `ThreadScreen` now render replies/messages from the cache; the full-screen spinner is skipped when a slice is already cached (instant back-navigation) and refetch runs silently in the background. `ThreadScreen`'s normalized `ThreadMessage` type was promoted to `types/index.ts` and added to the store's `ChatMessage` union; the parent message stays in local state (it's a single message, not a list). Added **LRU eviction**: the cache caps at 12 keys and drops the least-recently-used slices (recency bumped on every `setMessages`; `touchKey` exposed for focus-only bumps), but never evicts a slice holding an optimistic/pending message (`clientId` set or `temp-` id), so an in-flight send is never lost. Behavior-preserving — typechecks clean; needs on-device QA before shipping. ST-03 can now build the shared chat hook on top of this.

### ST-02 · ProgramDetail uses `channelStore` ⚪
- **Problem:** `channelStore` exists but `ProgramDetailScreen` mutates local `program` state instead — duplicated logic.
- **Fix:** Drive channel/category list from `channelStore`.

### ST-03 · Extract shared chat-screen architecture 🟡
- **Problem:** ChannelScreen / ConversationScreen / ThreadScreen (~700/755/523 lines) copy-paste FlatList + socket + send logic.
- **Fix:** Extract a shared `useChatMessages` hook + `MessageList` component. **Do after ST-01; enables UX-03/04 in one place.**

---

## 6. Mobile UX & iOS feel (Phase 3 — the "satisfying" layer)

### UX-01 · Optimistic send 🔴 (highest perceived-quality win) — **PARTIAL**
- **Problem:** Send waits for HTTP; no pending/failed/retry; no `clientId`. Latency hitch on every message.
- **Fix:** Add `clientId` + `status` to message type; paint the bubble immediately as `pending`; reconcile on server ack (match by `clientId`); show `failed` + tap-to-retry on error. Dedup socket echo by `clientId`/`id`.
- **Depends on:** ST-01.
- **Files:** chat screens, `types/index.ts`, message-send hook.
- **Done so far:** **Text messages** send optimistically on `ChannelScreen` + `ConversationScreen`. Flow: generate `clientId` → insert placeholder (`sendStatus: 'sending'`, dimmed bubble) → fire request → reconcile by `clientId` on the response. On error the row shows "Failed to send. Tap to retry." and re-sends with the same `clientId`. Backend echoes the `clientId` nonce on both the REST response and the socket broadcast (`new_message` / `new_dm_message`), so reconciliation is order-independent; `upsertMessage()` (in `messageStore.ts`) dedupes by `clientId` then `id` and collapses any duplicate left by a concurrent catch-up fetch. `keyExtractor` switched to `clientId ?? id` so the row doesn't remount when the temp id becomes the real id. Types gained optional `clientId` + `sendStatus` (`Message` + `DMMessage`).
- **Remaining:** File/attachment uploads still use request-then-append (they already show upload progress) — make them optimistic too. `ThreadScreen` replies not yet optimistic. Consider persisting `clientId` server-side for cross-device idempotency (currently echo-only).

### UX-02 · Optimistic reactions 🟡 — **DONE**
- **Problem:** `useReactions` awaits the API before updating UI despite "optimistic" comments.
- **Files:** `mobile/src/hooks/useReactions.ts:151`
- **Fix:** Update local state first; roll back on error.
- **DONE:** `handleAddReaction` and `handleToggleReaction` now paint the reaction change immediately, then persist; on error they apply the inverse op to roll back (add↔remove are exact inverses for the current user, and add is idempotent per-user so the socket echo — which already skips own reactions — can't double-count). Shared hook, so Channel/Conversation/Thread all get it.

### UX-03 · List performance 🟠
- **Problem:** Plain FlatList, no virtualization tuning, inline `renderMessage` closures, no row memo, `Swipeable` per row.
- **Fix:** Move to `@shopify/flash-list` (or tune FlatList: `windowSize`, `getItemLayout`, `removeClippedSubviews`); extract a memoized `MessageRow`; pass minimal props + `extraData`.
- **Pairs with:** ST-03.

### UX-04 · Preserve scroll position on history load 🟠 — **DONE**
- **Problem:** Prepending older messages teleports the viewport.
- **Fix:** `maintainVisibleContentPosition` (or inverted list). Verify on device.
- **DONE:** Added `maintainVisibleContentPosition={{ minIndexForVisible: 1 }}` to the `ChannelScreen` + `ConversationScreen` lists. Earlier history prepended at the top now keeps the currently-visible messages anchored instead of jumping (`minIndexForVisible: 1` so the load-more header at index 0 doesn't fight the anchor). Paired with the chat-scroll fix below (open-at-bottom + snap-to-bottom on send), which replaced the flaky `setTimeout(scrollToEnd)` calls with a "pinned to bottom" model that ignores reflow-driven `onScroll` events during a programmatic scroll (`programmaticScrollUntil`).

### UX-05 · Fix ScrollToBottomFAB fade ⚪
- **Problem:** Component returns `null` when hidden, so the fade-out never runs (it pops).
- **Files:** `mobile/src/components/ScrollToBottomFAB.tsx:29`

### UX-06 · Channel typing indicators 🟡 — **DONE**
- **Problem:** DM typing works; channel typing socket plumbing exists but ChannelScreen never subscribes/emits.
- **Fix:** Wire emit on input + subscribe in ChannelScreen (reuse `TypingIndicator`).
- **DONE:** The backend already rooms+enriches channel typing; only the mobile side was missing. Mirrored the DM wiring in `ChannelScreen`: `handleTextChange` emits `typing_start`/`typing_stop` (3s debounce, stops on send/unmount), and the channel subscribe now handles `user_typing`/`user_stopped_typing` (3s per-user expiry) and renders `<TypingIndicator>` above the input. Added a `ChannelTypingEventData` type (channel-keyed) so the enriched `displayName`/`avatarUrl` are typed instead of dropped.

### UX-07 · Haptics across messaging 🟡 — **DONE**
- **Problem:** No haptics on send, long-press, or reaction toggle.
- **Fix:** Add `expo-haptics` impacts/selection feedback at those touchpoints.
- **DONE:** Centralized in the shared hooks so all three chat screens get it: long-press → `impactAsync(Medium)` in `useMessageActions.openActions`; reaction add/toggle → `selectionAsync()` in `useReactions`. Send → `impactAsync(Light)` in `ChannelScreen` + `ConversationScreen` `handleSendMessage`. (ThreadScreen already inherits the long-press + reaction haptics via the shared hooks; its send haptic is the only minor gap, deferred with the rest of the ThreadScreen work.)

### UX-08 · Full emoji picker + "who reacted" 🟡
- **Problem:** Reactions limited to a few quick emojis; no reactor list.
- **Fix:** Add an emoji picker sheet; long-press a reaction to see who reacted.

### UX-09 · Better edit UX + edit in threads 🟡
- **Problem:** Inline edit is cramped; thread messages can't be edited.
- **Fix:** Dedicated edit affordance; enable edit action in ThreadScreen.

### UX-10 · Skeleton loaders 🟡
- **Problem:** Full-screen spinner on first load.
- **Fix:** Skeleton message rows for initial + pagination loads.

### UX-11 · Native context menus + toasts 🟡
- **Problem:** Modal bottom sheets for actions; copy shows an `Alert`.
- **Fix:** Use iOS context menus (long-press) where appropriate; replace copy `Alert` with a toast + haptic.

### UX-12 · Consistent draft-restore on failure ⚪
- **Problem:** DM restores draft on send failure; Channel doesn't.
- **Fix:** Unify behavior (restore on failure everywhere). Folds into UX-01.

### UX-13 · Fix mention autocomplete bugs 🟡 (Phase 1 — quick correctness win)
- **Problem:** `handleSelectMention` uses `value.lastIndexOf('@')` and assumes cursor at end — breaks with multiple `@` or mid-string edits.
- **Files:** `mobile/src/components/MessageInput.tsx:81,94-96`
- **Fix:** Track real cursor/selection; replace the active mention token only.

### UX-14 · Robust keyboard handling ⚪
- **Problem:** `keyboardVerticalOffset={90}` magic number, fragile across devices.
- **Fix:** Compute from header height or adopt `react-native-keyboard-controller`.

---

## 7. Product / information architecture

### PR-01 · Reconsider Programs-first IA 🟡
- **Problem:** Bottom-tab "Programs" grid adds a tap to everything, but most users live in one program daily.
- **Fix (explore):** Default landing to the active program's channel list (or a unified inbox); demote program-switching. Prototype before committing.

### PR-02 · Simplify role/permission model 🟡
- **Problem:** Discord-grade governance (3 tiers, 20 bitfield perms, channel/category overrides) for a classroom-sized audience — large security + maintenance surface.
- **Fix (explore):** Evaluate a fixed "Facilitator / Student / Guest" model. **Drives SEC-10.**

### PR-03 · Feature-floor pressure test ⚪
- **Problem:** Wide feature set (custom statuses w/ auto-expiry, category overrides, announcement channels...).
- **Fix:** Score each feature on weekly intern usage; cut or defer low-value/high-cost ones.

---

## 8. Design system

### DS-01 · Text-style tokens 🟡
- **Problem:** Only size + weight tokens; no composed text styles with line-height; rhythm applied inconsistently.
- **Files:** `mobile/src/constants/theme.ts`
- **Fix:** Add named text styles (display/title/body/caption/mono) with baked line-heights; adopt across screens.

### DS-02 · Brand identity 🟡
- **Problem:** Gold accent defined but unused; reads as "generic dark Discord."
- **Fix:** Define how/where the accent and brand express; build a small component kit (buttons, headers, badges).

### DS-03 · Enforce tokens, reduce inline styles ⚪
- **Problem:** Screens hand-roll inline styles, bypassing spacing/shadow tokens.
- **Fix:** Sweep screens to use tokens; consider a styled primitives layer.

### DS-04 · Light mode ⚪ (Phase 4, optional)
- Deferred until dark theme is polished.

---

## 9. Config / infra cleanup

| ID | Problem | File |
|----|---------|------|
| **INF-01** | Access token hardcodes `'15m'` instead of `config.jwt.accessExpiresIn` | `backend/src/utils/jwt.ts:14-17` |
| **INF-02** | `JWT_REFRESH_SECRET` is dead config (refresh tokens are DB UUIDs) | `backend/src/config/index.ts` |
| **INF-03** | `cleanupExpiredTokens` defined but never scheduled | `backend/src/utils/jwt.ts:88-97` |
| **INF-04** | Firebase creds only warn (don't fail) at startup | `backend/src/config/firebase.ts`, `config/index.ts` |
| **INF-05** | Mobile socket disconnects on expired token with no recovery (surfaced by SEC-01) | `mobile/src/services/socket.ts` |

### INF-05 · Mobile: refresh token + re-auth socket on `auth_error` 🟠
- **Problem:** Now that the socket requires a valid JWT (SEC-01), an expired access token at (re)connect time causes the server to emit `auth_error` and disconnect. The client currently has no handler, so it can loop reconnect→disconnect until an unrelated REST call refreshes the in-memory token.
- **Files:** `mobile/src/services/socket.ts` (add an `auth_error` listener), `mobile/src/services/api.ts` / `authStore` (reuse refresh flow).
- **Fix:** On `auth_error`, call the existing refresh-token flow, then re-emit `authenticate` with the new access token; back off if refresh fails (treat as logged out).
- **Done when:** A socket connecting with an expired token transparently recovers after one refresh, with no reconnect loop.
- **DONE:** `socket.ts` now handles `auth_error` → single-flight `refreshAccessToken()` → reconnect, with a retry cap (max 2 per 30s) to prevent loops. Refresh is now single-flight in `api.ts` (shared by the HTTP 401 interceptor and the socket) so the single-use refresh token isn't double-spent. Also added a server `authenticated` ack: clients now defer room re-joins until the server confirms identity, fixing a latent SEC-02 race where reconnect re-joins could arrive before the socket was registered and be silently denied.

---

## Execution roadmap (the order we actually work in)

### Phase 1 — Stabilize & secure (ship before more beta users)
Close the holes and correctness bugs. Mostly small, high-leverage backend changes.
> SEC-01 → SEC-02 → SEC-03 → RT-03 → DAT-01 → DAT-02 → SEC-04 → SEC-05 → SEC-06 → SEC-07 → SEC-08 → SEC-09 → INF-01 → INF-04 → UX-13

**Exit criteria:** No known auth/IDOR holes; message writes are atomic; uploads notify; basic input validation + rate limiting in place.

### Phase 2 — Foundations for the redesign
Architecture, data layer, product decisions, design language. Unblocks Phase 3.
> PR-02 (+ SEC-10) → PR-01 → PR-03 → DS-01 → DS-02 → ST-01 → ST-03 → RT-01 → RT-02 → PE-03 → PE-02 → PE-01 → PE-04 → ST-02 → DAT-03 → RT-04 → INF-02 → INF-03 → DS-03

**Exit criteria:** Decided IA + role model; design tokens/components ready; central message cache live; search/queries scale-ready.

### Phase 3 — Make it satisfying on iOS
The interaction polish that makes it feel like Slack/iMessage. Build on ST-01/ST-03.
> UX-01 → UX-04 → UX-03 → UX-02 → UX-06 → UX-07 → UX-08 → UX-09 → UX-10 → UX-11 → UX-05 → UX-12 → UX-14

**Exit criteria:** Instant optimistic send w/ retry; buttery list scrolling; haptics + native feel throughout.

### Phase 4 — Nice-to-haves
> DS-04 (light mode) and anything deferred from PR-03.

---

## Changelog

_Append one line per completed item: `YYYY-MM-DD · ID · short note · commit`._

- 2026-06-10 · SEC-01 · Socket `authenticate` now requires a valid JWT; invalid/absent token emits `auth_error` and disconnects (no raw-userId fallback).
- 2026-06-10 · SEC-02 · `join_program`/`join_channel`/`join_conversation` now verify membership/participation (+ private-channel access) via shared `utils/access.ts`.
- 2026-06-10 · SEC-03 · Private-channel access + announcement perms enforced on channel POST and channel upload.
- 2026-06-10 · SEC-04 · `@everyone`/`@here` only honored with `MENTION_EVERYONE`, centralized in `services/messageDispatch.ts`.
- 2026-06-10 · SEC-05 · Edit/delete now re-check channel access (removed members / lost private access are rejected).
- 2026-06-10 · SEC-06 · Added `middleware/rateLimit.ts`: IP login limiter + per-user message limiter (NAT-safe), wired to auth + message/upload routes.
- 2026-06-10 · SEC-07 · (PARTIAL) Added `validateBody()` Zod middleware on channel send/edit, DM send, auth firebase/refresh; DM messages capped at 4000.
- 2026-06-10 · SEC-08 · `/users/search` scoped to users sharing a program with the caller (no global directory/email enumeration).
- 2026-06-10 · SEC-09 · `validateConfig` fails in prod on missing required secrets and rejects dev-default JWT secrets.
- 2026-06-10 · DAT-01/DAT-02 · Channel + DM sends wrapped in `prisma.$transaction` (message + parent counter + mention counts atomic); emits moved post-commit.
- 2026-06-10 · RT-03 · File uploads (channel + DM) now route through the same unread + push pipeline as text via `messageDispatch.ts`.
- 2026-06-10 · INF-01 · Access token uses `config.jwt.accessExpiresIn` instead of hardcoded `'15m'`.
- 2026-06-10 · INF-04 · Firebase credentials are now required (fail-fast) in production via `validateConfig`.
- 2026-06-10 · UX-13 · Mention autocomplete is cursor-accurate: replaces the active `@` token (not the last one) and repositions the caret after insert.
- 2026-06-10 · INF-05 · Opened as Phase-1 follow-up (mobile socket must refresh + re-auth on `auth_error`).
- 2026-06-12 · INF-05 · Mobile socket recovers from `auth_error` via single-flight token refresh + explicit reconnect (retry-capped); added server `authenticated` ack so reconnect room re-joins wait for auth (fixes latent SEC-02 reconnect race).
- 2026-06-12 · ST-01 · Added central message cache (`messageStore.ts`); migrated ChannelScreen + ConversationScreen to it (instant back-nav, no full-screen spinner when cached). ThreadScreen migration + eviction deferred.
- 2026-06-12 · RT-01 · Added background catch-up (refetch latest + `mergeMessagesById`) on screen re-focus and on socket reconnect for ChannelScreen + ConversationScreen, so messages missed during a disconnect/while-away reconcile. Large-gap (>50) fill, away-deletes pruning, and ThreadScreen deferred.
- 2026-06-12 · PE-03 · Collapsed the N+1 conversation-unread-count loop into a single grouped `$queryRaw` joining each participant's `lastReadAt`.
- 2026-06-12 · UX-01 · Optimistic text send for ChannelScreen + ConversationScreen (clientId placeholder → reconcile by clientId → failed/tap-to-retry). Backend echoes clientId on REST + socket; `upsertMessage` dedupes by clientId/id. Uploads + ThreadScreen deferred.
- 2026-06-13 · UX · Chat scroll fix: open-at-bottom + snap-to-bottom on send now reliable. Replaced flaky `setTimeout(scrollToEnd)` calls with a "pinned to bottom" model; a `programmaticScrollUntil` guard makes `onScroll` ignore reflow events during a programmatic scroll so variable-height row measurement can't park the list short of the end. Bumped list bottom padding for a comfortable gap above the input bar.
- 2026-06-13 · UX-04 · Added `maintainVisibleContentPosition={{ minIndexForVisible: 1 }}` to ChannelScreen + ConversationScreen so loading older history keeps the visible messages anchored instead of teleporting the viewport.
- 2026-06-13 · UX-02 · Reactions are now truly optimistic in `useReactions` (paint first, persist after, inverse-op rollback on error). Applies to all three chat screens via the shared hook.
- 2026-06-13 · UX-06 · Channel typing indicators wired in ChannelScreen (emit on input w/ 3s debounce + subscribe + `TypingIndicator`), mirroring DMs. Added `ChannelTypingEventData`.
- 2026-06-13 · UX-07 · Haptics added: long-press (`useMessageActions`, Medium impact), reaction add/toggle (`useReactions`, selection), and send (Channel + Conversation, Light impact).
- 2026-06-15 · ST-01 · DONE. Migrated `ThreadScreen` to the central cache (`thread:<parentMessageId>` slice via `useCachedMessages` + setState-style dispatcher; promoted `ThreadMessage` to `types/index.ts` and into the `ChatMessage` union; instant cached-reply render, silent background refetch; parent kept in local state). Added LRU eviction to `messageStore.ts` (cap 12 keys, drop least-recently-used; recency bumped in `setMessages`, `touchKey` exposed) that never evicts a slice with an optimistic/pending message.
- 2026-06-15 · RT-01 · Catch-up now reconciles via `reconcileCatchUp` (in `messageStore.ts`) in ChannelScreen + ConversationScreen: gap-fill (when >1 page arrived while away and the fetched page doesn't overlap the cache, reset to the fetched page and set `hasMore=true` so the user scrolls up to backfill instead of seeing a silent non-contiguous gap) plus prune of away-deletes (drop cached messages inside the fetched window the server no longer returns; never prunes pending/optimistic messages or messages older than the window). `mergeMessagesById` is retained and reused inside the helper. Only remaining RT-01 work is ThreadScreen catch-up (after ST-01 — now done, so eligible as a follow-up).
- 2026-06-15 · UX-01 · ThreadScreen replies now send optimistically (instant `temp-<clientId>` placeholder → reconcile by clientId via `upsertMessage` → dim while sending, "Failed to send. Tap to retry." on error). Mirrors ChannelScreen; `ThreadMessage` already carried the optimistic fields from ST-01. Remaining UX-01: uploads + optional server clientId idempotency.
- 2026-06-15 · SEC-07 · DONE. Added Zod `validateBody` to the remaining unguarded write endpoints across program/category/channel-management (`program.routes.ts`), role (`role.routes.ts`), channel read/mute (`channel.routes.ts`), and reaction (`reaction.routes.ts`) routes. (No separate `category.routes.ts`; categories live in `program.routes.ts`.) Body-less writes left as-is, consistent with the existing pattern.
- 2026-06-15 · PE-02 · DONE. `scope=all` message search now over-fetches `skip+take` from each of the channel + DM buckets, merge-sorts by `createdAt desc`, and slices `[skip, skip+take]` so deeper pages are reachable; `hasMore` accounts for remaining merged rows or either bucket being truncated. `scope=channels`/`dms` and all access control unchanged.
- 2026-06-15 · INF-02 · DONE. Removed dead `JWT_REFRESH_SECRET` config (`refreshSecret` field, its `requiredInProduction` entry, and the dev-default check) — refresh tokens are DB-stored UUIDs, not JWTs. Kept `refreshExpiresIn` + the `JWT_ACCESS_SECRET` checks. Follow-up: scrub `JWT_REFRESH_SECRET` from `backend/.env.example` + setup docs.
- 2026-06-15 · UX-01 · DONE. File/image sends are now optimistic in ChannelScreen + ConversationScreen: instant placeholder with local preview (local `uri`→`fileUrl` for image preview), live `Uploading… %` via a per-clientId progress map, reconcile by clientId via `upsertMessage`, and tap-to-retry on failure (picked files retained in a `Map<clientId, SelectedFile[]>`). Combined with earlier text + thread-reply optimism, UX-01 mobile UX is complete. Parked (needs decision): optional server-side `clientId` idempotency.
- 2026-06-15 · RT-01 · DONE. Added ThreadScreen catch-up (refetch latest thread replies + refresh parent, additive `mergeMessagesById` into the `thread:<id>` slice) on refocus (skip-first) + reconnect (wasConnected guard), mirroring the other chat screens. Chose `mergeMessagesById` over `reconcileCatchUp` because the latter's gap/prune window is tuned for newest-first channel pagination and could wrongly prune oldest-first thread replies; additive merge preserves pending optimistic replies (`temp-*`/clientId).
- 2026-06-15 · RT-02 · DONE. Moved unread filtering server-side using socket.io `.except()` (v4.8.3): `unread:channel`/`unread:mention` now `io.to('program:<id>').except('channel:<id>')` (messageDispatch), and DM `unread:dm` now `io.to('user:<id>').except('conversation:<id>')` (conversation.routes + upload.routes). Dropped `excludeSocketIds` from all payloads and removed the mobile `shouldIgnoreEvent` client-side filter (socket.ts, ProgramDetailScreen, ConversationsListScreen).
- 2026-06-15 · UX-05 · DONE. ScrollToBottomFAB now plays its exit animation: keep it mounted via a `mounted` state through a single `progress` Animated value (opacity + 0.8→1 scale), unmounting only in the completion callback, instead of returning null the instant `visible` flips false.
- 2026-06-15 · ST-02 · DONE. ProgramDetailScreen now sources channels/categories from the shared `channelStore` (new `fetchProgramChannels` action; `useProgramChannels`/`useProgramCategories` selectors) and routes channel/category realtime events through the store; local state retains only program metadata. First real channelStore consumer.
- 2026-06-15 · INF-03 · DONE. `index.ts` now schedules `cleanupExpiredTokens` on startup + every 24h (`scheduleTokenCleanup`): logs deleted count, catches errors, in-flight guard against overlap, `.unref()` so it doesn't block shutdown. No new deps.
- 2026-06-15 · UX-12 · DONE. ChannelScreen now clears the input draft once up front in `handleSendMessage` (parity with ConversationScreen); failed text/upload sends already preserve the draft via the optimistic failed/retry row (text on the row, files in `pendingUploadsRef`).
- 2026-06-15 · PE-04 · PARTIAL. Channel mentions now tokenize to stable `<@userId>`/`<@&roleId>` at send time (new `mobile/src/utils/mentions.ts` `toMentionTokens`, longest-match), backend `resolveChannelMentions` resolves by id (+ legacy `@Name` union, deduped), and `MarkdownText` renders tokens→names when passed id→name maps (ChannelScreen passes them) with legacy `@Name` fallback preserved. Composer still displays @Name (drafts persist as text).
- 2026-06-15 · PE-04b · (push-preview leak fixed) Added `renderMentionTokensToText(content, programId)` to `messageDispatch.ts` and applied it to `pushChannelMessage` previews, so push notifications now show `@Name`/`@Role` instead of raw `<@id>` tokens (no DB hit when content has no tokens; unknown ids dropped). Confirmed `MarkdownText` already drops unresolved tokens (no raw-token leak on mobile). Remaining (PE-04b-mobile): pass id→name maps to thread-parent/pinned/search screens so the mention word renders rather than being dropped.
- 2026-06-15 · PE-04b-mobile · PE-04 now DONE. ThreadScreen (channel threads) + PinnedMessagesScreen fetch program members/roles and pass `mentionUsers`/`mentionRoles` to `MarkdownText` (parent + replies / pinned), so channel mention tokens render as highlighted `@Name`/`@Role`. Added `programId` to the `Thread` route param (passed from ChannelScreen's navigate calls). DM threads/pins pass empty maps (unchanged drop fallback); MarkdownText/composer/backend untouched. Global message-search results left as accepted drop behavior (spans multiple programs).
- 2026-06-15 · UX-14 · DONE. Replaced the hardcoded `keyboardVerticalOffset={...?90:0}` on ChannelScreen/ConversationScreen/ThreadScreen with `useHeaderHeight()` from `@react-navigation/elements` (already present transitively; returns 0 when `headerShown:false`). Android unchanged at 0.
- 2026-06-15 · BUGFIX · Session/logout hardening: `resetSessionState()` clears message cache, channel/unread/mute/presence/member/role stores, active-chat tracking, and all `draft:*` AsyncStorage keys on logout, token refresh failure, socket auth exhaustion, invalid init token, and fresh login. Token refresh failure now full local logout (Firebase + SecureStore). Socket `connected` only after `authenticated`; auth retry cap triggers logout. Initial message/thread fetch merges instead of replaces (preserves socket + optimistic rows); fetch errors clear stale cache. `activeChatStore` fixes false unread when opening chats from Search/push. Push token refresh gated on access token. Stable `EMPTY_CHANNEL_UNREAD` selector. iOS autocorrect no longer repopulates draft after send (`MessageInput`). Program screen crash fixed (`channelStore` stable empty refs).
- 2026-06-15 · DS-01 · DONE. Added a composed `textStyles` type scale to `theme.ts` (`composeTextStyle` helper → largeTitle/title/heading/subheading/body/bodyStrong/callout/subhead/footnote/caption/label), built from the existing `typography` primitives (lineHeight resolved to px), `satisfies Record<string, TextStyle>`, exported via `theme` + `TextStyles`/`TextStyleToken` types. No screen refactor yet (that's DS-03). Note: the worker's runner hit a ping timeout at finalization but the edit completed and typechecks clean.
