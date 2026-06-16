# InternHub — Backlog Status (source of truth)

> **This file is the single source of truth for the refactor backlog.** It is meant to be
> read by a "planner" chat (see `PLANNER_PROMPT.md`) and updated by "worker" chats as their
> last step. Keep it terse — detailed rationale lives in `IMPROVEMENT_PLAN.md` + the changelog there.
>
> **Last updated:** 2026-06-15

**Status:** `TODO` · `PARTIAL` · `DONE` · `BLOCKED` · `WONTFIX`
**Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low
**Phase:** 1 = stabilize/secure · 2 = foundations (data + product + design) · 3 = iOS polish · 4 = nice-to-have

## Index

| ID | Title | Sev | Ph | Status | Primary files |
|----|-------|-----|----|--------|---------------|
| SEC-01 | Socket auth requires valid JWT (no raw-userId fallback) | 🔴 | 1 | DONE | `backend/src/index.ts` |
| SEC-02 | Authorize socket room joins server-side | 🔴 | 1 | DONE | `backend/src/index.ts`, `backend/src/utils/access.ts` |
| SEC-03 | Private-channel + send perms on POST/upload | 🟠 | 1 | DONE | `backend/src/routes/channel.routes.ts`, `backend/src/routes/upload.routes.ts` |
| SEC-04 | Enforce `MENTION_EVERYONE` permission | 🟡 | 1 | DONE | `backend/src/services/messageDispatch.ts` |
| SEC-05 | Re-check membership on message edit/delete | 🟡 | 1 | DONE | `backend/src/routes/channel.routes.ts` |
| SEC-06 | Wire rate limiting (auth + messages) | 🟠 | 1 | DONE | `backend/src/middleware/rateLimit.ts`, `backend/src/index.ts` |
| SEC-07 | Zod validation on write endpoints | 🟡 | 1 | DONE | `backend/src/middleware/validate.ts`, `backend/src/routes/*.ts` |
| SEC-08 | Scope `/users/search` + stop leaking emails | 🟡 | 1 | DONE | `backend/src/routes/user.routes.ts` |
| SEC-09 | Fail on missing/default secrets in prod | 🟡 | 1 | DONE | `backend/src/config/index.ts` |
| SEC-10 | Use override perms or delete dead model (ties to PR-02) | 🟡 | 2 | TODO | `backend/src/utils/permissions.ts`, `backend/src/routes/program.routes.ts` |
| DAT-01 | Wrap message-send side effects in a transaction | 🟠 | 1 | DONE | `backend/src/routes/channel.routes.ts`, `backend/src/routes/conversation.routes.ts` |
| DAT-02 | Make thread `replyCount` updates atomic | 🟡 | 1 | DONE | `backend/src/routes/channel.routes.ts` |
| DAT-03 | Prevent duplicate 1:1 conversations | 🟡 | 2 | TODO | `backend/src/routes/conversation.routes.ts`, `backend/prisma/schema.prisma` |
| RT-01 | Reliable delivery: reconnect/focus catch-up | 🟠 | 2 | DONE | `mobile/src/screens/ChannelScreen.tsx`, `mobile/src/screens/ConversationScreen.tsx`, `mobile/src/screens/ThreadScreen.tsx`, `mobile/src/store/messageStore.ts` |
| RT-02 | Server-side unread filtering (drop `excludeSocketIds`) | 🟡 | 2 | DONE | `backend/src/services/messageDispatch.ts`, `backend/src/routes/conversation.routes.ts`, `backend/src/routes/upload.routes.ts`, `mobile/src/services/socket.ts` |
| RT-03 | Route upload messages through unread + push | 🟠 | 1 | DONE | `backend/src/routes/upload.routes.ts`, `backend/src/services/messageDispatch.ts` |
| RT-04 | Redis adapter for Socket.io (multi-instance) | 🟡 | 2 | TODO | `backend/src/index.ts` |
| PE-01 | Full-text / trigram search index | 🟡 | 2 | TODO | `backend/src/routes/search.routes.ts`, `backend/prisma/schema.prisma` |
| PE-02 | Fix `scope=all` search merge correctness | 🟡 | 2 | DONE | `backend/src/routes/search.routes.ts` |
| PE-03 | Fix N+1 on conversation unread counts | 🟡 | 2 | DONE | `backend/src/routes/conversation.routes.ts` |
| PE-04 | Stable mention tokens (`<@id>`) | 🟡 | 2 | DONE | `backend/src/services/messageDispatch.ts`, `mobile/src/utils/mentions.ts`, `mobile/src/components/MarkdownText.tsx`, `mobile/src/screens/{ChannelScreen,ThreadScreen,PinnedMessagesScreen}.tsx` — global search results keep accepted drop behavior (multi-program) |
| ST-01 | Central message cache (no refetch on back-nav) | 🟠 | 2 | DONE | `mobile/src/store/messageStore.ts`, chat screens (ChannelScreen, ConversationScreen, ThreadScreen) |
| ST-02 | `ProgramDetailScreen` uses `channelStore` | ⚪ | 2 | DONE | `mobile/src/screens/ProgramDetailScreen.tsx`, `mobile/src/store/channelStore.ts` |
| ST-03 | Extract shared chat-screen architecture | 🟡 | 2 | TODO | new `mobile/src/hooks/useChatMessages.ts` + `mobile/src/components/MessageList.tsx`; chat screens |
| UX-01 | Optimistic send (clientId + pending/failed/retry) | 🔴 | 3 | DONE | chat screens, `mobile/src/types/index.ts`, `mobile/src/store/messageStore.ts` — optional server `clientId` idempotency parked (needs decision) |
| UX-02 | Optimistic reactions | 🟡 | 3 | DONE | `mobile/src/hooks/useReactions.ts` |
| UX-03 | List perf: FlashList + memoized rows | 🟠 | 3 | TODO | chat screens (pairs with ST-03); consider `@shopify/flash-list` |
| UX-04 | Preserve scroll position on history load | 🟠 | 3 | DONE | `mobile/src/screens/ChannelScreen.tsx`, `mobile/src/screens/ConversationScreen.tsx` |
| UX-05 | Fix ScrollToBottomFAB fade-out | ⚪ | 3 | DONE | `mobile/src/components/ScrollToBottomFAB.tsx` |
| UX-06 | Channel typing indicators | 🟡 | 3 | DONE | `mobile/src/screens/ChannelScreen.tsx`, `mobile/src/services/socket.ts` |
| UX-07 | Haptics across messaging | 🟡 | 3 | DONE | `mobile/src/hooks/useMessageActions.ts`, `mobile/src/hooks/useReactions.ts`, chat screens |
| UX-08 | Full emoji picker + "who reacted" | 🟡 | 3 | TODO | `mobile/src/components/MessageActions.tsx`, `mobile/src/components/ReactionBar.tsx` |
| UX-09 | Better edit UX + edit in threads | 🟡 | 3 | TODO | `mobile/src/hooks/useMessageEdit.ts`, `mobile/src/screens/ThreadScreen.tsx` |
| UX-10 | Skeleton loaders instead of spinners | 🟡 | 3 | TODO | `mobile/src/components/ChatStates.tsx`, chat screens |
| UX-11 | Native context menus + toast feedback | 🟡 | 3 | TODO | `mobile/src/components/MessageActions.tsx` |
| UX-12 | Draft-restore parity on send failure | ⚪ | 3 | DONE | `mobile/src/screens/ChannelScreen.tsx` |
| UX-13 | Fix mention autocomplete cursor/index bugs | 🟡 | 1 | DONE | `mobile/src/components/MessageInput.tsx` |
| UX-14 | Robust keyboard handling (drop magic offset) | ⚪ | 3 | DONE | chat screens (`keyboardVerticalOffset` via `useHeaderHeight()`) |
| PR-01 | Reconsider Programs-first IA | 🟡 | 2 | TODO (needs user decision) | `mobile/src/navigation/AppNavigator.tsx` |
| PR-02 | Simplify role/permission model | 🟡 | 2 | TODO (needs user decision) | `backend/src/utils/permissions.ts` |
| PR-03 | Feature-floor pressure test | ⚪ | 2 | TODO (needs user decision) | — |
| DS-01 | Text-style tokens / typographic scale | 🟡 | 2 | DONE | `mobile/src/constants/theme.ts` |
| DS-02 | Brand identity / component kit | 🟡 | 2 | TODO | `mobile/src/constants/theme.ts` |
| DS-03 | Enforce tokens, reduce inline styles | ⚪ | 2 | TODO | mobile screens |
| DS-04 | Light mode | ⚪ | 4 | TODO | `mobile/src/constants/theme.ts` |
| INF-01 | Access-token `expiresIn` from config | ⚪ | 1 | DONE | `backend/src/utils/jwt.ts` |
| INF-02 | Remove dead `JWT_REFRESH_SECRET` config | ⚪ | 2 | DONE | `backend/src/config/index.ts` |
| INF-03 | Schedule `cleanupExpiredTokens` job | ⚪ | 2 | DONE | `backend/src/utils/jwt.ts`, `backend/src/index.ts` |
| INF-04 | Validate Firebase creds at startup | ⚪ | 1 | DONE | `backend/src/config/firebase.ts`, `backend/src/config/index.ts` |
| INF-05 | Mobile: refresh + re-auth socket on `auth_error` | 🟠 | 1 | DONE | `mobile/src/services/socket.ts`, `mobile/src/services/api.ts` |

## Notes
- Chat-scroll polish (open-at-bottom + snap-to-bottom on send) shipped alongside UX-04 in both chat screens (`programmaticScrollUntil` "pinned to bottom" model).
- Dependency rule: don't start a Phase 3 polish item whose Phase 1/2 dependency is still open. Known deps: UX-01→ST-01; UX-03→ST-03; SEC-10→PR-02.
- Local stack: backend `cd backend && npm run dev` (port 3000, talks to **prod Supabase**); mobile dev build targets `localhost:3000`; iOS sim via `npx expo run:ios`.
