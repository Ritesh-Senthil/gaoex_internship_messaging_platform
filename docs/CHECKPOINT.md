# InternHub Development Checkpoint

> **Last Updated:** February 12, 2026
> **Latest Commit:** UI revamp: DMs module — black/blue/gold theme, Ionicons, professional polish
> **Repo:** [gaoex_internship_messaging_platform_trimmed](https://github.com/Ritesh-Senthil/gaoex_internship_messaging_platform_trimmed)
> **Full Spec:** [SPECIFICATION.md](./SPECIFICATION.md)

---

## 1. Goal / Non-goals

**Goal:** A mobile-first Discord/Slack-style collaboration platform for internship programs. Facilitators and students communicate, share resources, and collaborate within programs that have channels, roles, and DMs.

**In scope (implemented):**
- Google OAuth, JWT auth, auto-join default program
- Programs with invite codes, private programs, archive/restore
- Tier-based roles (Owner/Admin/Moderator/Member) with 20 bitfield permissions
- Categories + Channels (TEXT, ANNOUNCEMENT), private channels with permission overrides
- Real-time messaging (channels + DMs) with markdown, @mentions, reactions, file attachments
- Comprehensive real-time updates for all CRUD operations (see Socket Events below)
- Unread badges (blue dot) + mention badges (red count)
- Online/offline presence
- Rich profile system: avatar upload (Supabase Storage), display name, bio with markdown (~280 chars), banner color, custom status (emoji + text + auto-clear), account info (read-only)
- Reusable `UserAvatar` component with image support and initial fallback across all screens
- Rich profile cards on `MemberProfileScreen` (Discord-style: banner, avatar, badges, bio, status)
- Tappable avatars in channel and DM messages to navigate to user profiles
- Push notifications (Expo Push — All 6 chunks code complete, pending on-device testing. See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md))
- Message search across channels & DMs with scope filters, pagination, scroll-to-highlight
- Markdown rendering component with bold, italic, code, strikethrough support
- Group DMs with custom naming, participant management, real-time updates (max 8 participants)
- Threaded replies in channels and DMs: inline thread indicators, dedicated ThreadScreen, swipe-to-reply gesture, "Reply in Thread" long-press action, real-time thread metadata updates
- Message pinning: pin/unpin via long-press action (with `MANAGE_MESSAGES` permission check), dedicated `PinnedMessagesScreen` per channel/DM, real-time pin/unpin socket events, tap-to-highlight in context
- Typing indicators in DMs: animated dots with avatars and names, up to 2 names then "and X others", 3s auto-timeout, server-side profile caching for zero-DB-lookup broadcasts
- Message drafts: unsent text auto-saved per channel/DM/thread via `useDraft` hook + AsyncStorage, debounced save (500ms), flush on unmount, clear on send

**Not yet built:**
- Read receipts / "Seen by"
- Message forwarding
- Voice messages, web client

---

## 2. Module Map

```
slack_clone/
├── backend/                        # Node.js + Express + Socket.io
│   ├── prisma/
│   │   ├── schema.prisma           # 16 models (see Data Models below)
│   │   ├── migrations/             # Prisma migrations
│   │   └── seed.ts                 # Seeds default program + super admin
│   └── src/
│       ├── config/                 # DB, Firebase, Supabase init
│       ├── middleware/auth.ts      # JWT verification, req.user injection
│       ├── routes/
│       │   ├── auth.routes.ts      # Google OAuth, refresh, logout
│       │   ├── program.routes.ts   # Programs + categories + channels CRUD + member lookup by userId
│       │   ├── channel.routes.ts   # Messages, read-status, channel-level ops
│       │   ├── conversation.routes.ts  # DM conversations + messages
│       │   ├── role.routes.ts      # Role CRUD + member role assignment
│       │   ├── reaction.routes.ts  # Add/remove emoji reactions
│       │   ├── upload.routes.ts    # File upload to Supabase Storage
│       │   ├── search.routes.ts    # Message search with scoped queries + access control
│       │   └── user.routes.ts      # Profile update, avatar upload/remove, user search, shared program lookup
│       ├── utils/
│       │   ├── jwt.ts              # Token generation/verification
│       │   └── permissions.ts      # Bitfield permission checks
│       └── index.ts                # Express app + Socket.io server
├── mobile/                         # React Native + Expo (SDK 54)
│   └── src/
│       ├── components/
│       │   ├── MessageInput.tsx     # Message composer with attachments
│       │   ├── ReactionBar.tsx      # Emoji reaction display
│       │   ├── MessageActions.tsx   # Unified action sheet: quick-react emojis + reply/pin/copy/edit/delete (Ionicons)
│       │   ├── ChatStates.tsx       # Shared loading spinner and error-with-retry components
│       │   ├── ThreadIndicator.tsx  # Thread reply indicator (avatars, count, last reply time)
│       │   ├── EditProfileModal.tsx # Self-contained edit profile modal (name, bio, banner color)
│       │   ├── StatusModal.tsx      # Self-contained custom status modal (emoji, text, duration)
│       │   ├── MarkdownText.tsx     # Inline markdown renderer (bold, italic, code, strikethrough)
│       │   ├── UserAvatar.tsx       # Reusable avatar with image/initial fallback + status dot
│       │   ├── SwipeableMessage.tsx  # Swipe-right-to-reply gesture wrapper
│       │   ├── TypingIndicator.tsx  # Animated typing dots with avatars + names
│       │   ├── AddMembersModal.tsx       # Reusable add-members modal (search + add for group DMs)
│       │   ├── PermissionToggleGrid.tsx # Collapsible permission grid (shared: RoleDetail + CreateRole)
│       │   └── programSettings/         # ProgramSettingsScreen section components
│       │       ├── ProgramInfoSection.tsx   # View/edit program name, description, privacy
│       │       ├── InviteCodeSection.tsx    # Invite code display, share, regenerate
│       │       ├── JoinRequestList.tsx      # Pending join requests with approve/reject
│       │       └── DangerZoneSection.tsx    # Archive/restore/delete + archived banner
│       ├── hooks/
│       │   ├── useDraft.ts         # AsyncStorage-backed message draft persistence
│       │   ├── useReactions.ts     # Shared reaction add/toggle/socket-apply logic (generic)
│       │   ├── useMessageActions.ts # Shared action sheet open/close state
│       │   ├── useMessageHighlight.ts # Shared scroll-to-highlight with animation + cleanup
│       │   ├── useAttachments.ts   # Shared file selection, picker, upload progress state
│       │   ├── useMute.ts          # Shared mute fetch/toggle for channels and conversations
│       │   ├── useMessageEdit.ts   # Shared inline message edit state + save API
│       │   ├── useAvatar.ts        # Avatar upload, remove, platform action sheet
│       │   ├── useEditProfile.ts   # Edit profile modal state + save API
│       │   └── useCustomStatus.ts  # Custom status draft, expiration timer, save/clear
│       ├── utils/
│       │   ├── dateFormatters.ts   # Shared date/time formatting (message time, relative, headers)
│       │   └── debounce.ts        # Shared debounce utility (used by GroupInfoScreen, NewConversationScreen)
│       ├── constants/
│       │   ├── config.ts           # API_URL, SOCKET_URL
│       │   └── theme.ts            # Colors, spacing
│       ├── navigation/AppNavigator.tsx  # Stack + bottom tabs (profile tab shows avatar)
│       ├── screens/                # 20 screens (see below)
│       ├── services/
│       │   ├── api.ts              # Axios client with interceptors + userApi (profile, avatar, sharedProgram) + searchApi + muteApi
│       │   ├── socket.ts           # Socket.io client + event subscriptions
│       │   ├── notifications.ts    # Expo push notification registration, permissions, token refresh
│       │   ├── navigationRef.ts    # Imperative navigation ref for deep linking
│       │   └── firebase.ts         # Firebase auth config
│       ├── store/                  # Zustand stores
│       │   ├── authStore.ts        # User session, tokens, push registration on login/logout
│       │   ├── channelStore.ts     # Unread channel state
│       │   ├── notificationStore.ts # Push token state, permission status
│       │   ├── muteStore.ts        # Per-channel and per-conversation mute state
│       │   ├── memberStore.ts      # Member events (unused store, events in screens)
│       │   ├── roleStore.ts        # Role events (unused store, events in screens)
│       │   └── presenceStore.ts    # Online/offline user map
│       └── types/index.ts          # All TypeScript interfaces
└── docs/
    ├── SPECIFICATION.md            # Full feature requirements
    └── CHECKPOINT.md               # This file
```

**Key screens:** `ProgramsScreen` (list), `ProgramDetailScreen` (channels/categories), `ChannelScreen` (messages + scroll-to-highlight + tappable avatars + pin button), `ConversationsListScreen` (DMs), `ConversationScreen` (DM chat + scroll-to-highlight + tappable avatars + typing indicator + pin button), `ThreadScreen` (threaded replies), `PinnedMessagesScreen` (pinned messages per channel/DM), `SearchScreen` (message search with scope filters + avatar images), `MemberDirectoryScreen` (avatar images), `MemberProfileScreen` (rich profile card with banner, bio, status), `ProfileScreen` (own profile + avatar upload + bio + status + account info), `NewConversationScreen` (user search with avatars), `RolesListScreen`, `RoleDetailScreen`, `AssignRolesScreen`, `ChannelManagementScreen`, `ChannelPermissionsScreen`, `ProgramSettingsScreen`, `LoginScreen`

---

## 3. Key Decisions & Patterns

| Pattern | Detail |
|---------|--------|
| **Auth** | Firebase Google OAuth -> backend verifies token -> issues JWT access (15min) + refresh (30d) |
| **Role hierarchy** | Tier 0=Owner, 1=Admin, 2=Moderator, 3=Member. Lower tier = more authority. Permissions are BigInt bitfields (20 flags) |
| **Super Admin** | `User.isSuperAdmin` bypasses all permission checks platform-wide |
| **Private channels** | `PermissionOverride` entries for roles/users; admins (tier 0-1) always have access |
| **State management** | Zustand stores. `authStore` for session (includes profile fields), `presenceStore` for online map, `channelStore` for unread tracking |
| **Real-time architecture** | Backend emits Socket.io events on all CRUD mutations. Mobile screens subscribe in `useEffect` with cleanup. Events target rooms: `user:{userId}`, `program:{programId}`, `channel:{channelId}`, `conversation:{conversationId}` |
| **Profile updates** | `user:profile_updated` event broadcasts all profile fields (displayName, avatarUrl, bio, bannerColor, statusEmoji, statusText, statusExpiresAt). Screens update local state on receipt |
| **Avatar rendering** | `UserAvatar` component used across all screens: shows uploaded image with `onError` fallback to colored initial circle. Deterministic color from name. Optional status dot |
| **Avatar storage** | Uploaded via `POST /api/users/me/avatar` with `multer` -> stored in Supabase Storage `avatars/` bucket -> URL saved to `User.avatarUrl`. Login preserves custom avatar over Firebase photo |
| **Custom status** | Emoji + text with expiration (1h, 4h, today, don't clear). Real-time expiration via `useEffect` + `setTimeout`. Cleared via `PATCH /api/users/me` with null fields |
| **Unread tracking** | `ChannelRead` model (channels) and `ConversationParticipant.lastReadAt` (DMs). Backend emits `unread:channel`, `unread:dm`, `unread:mention`. Client updates optimistically on screen focus/exit |
| **File uploads** | Supabase Storage via `multer` -> signed URL returned to client |
| **Navigation** | React Navigation v7 - native stack + bottom tabs (Programs, DMs, Search, Profile). Profile tab icon shows user avatar image |
| **Profile navigation** | Channel/DM message avatars are tappable. For DMs, `GET /api/users/:userId/shared-program` finds a common program to construct the `MemberProfile` route |

---

## 4. Interfaces & Contracts

### API Endpoints

| Group | Endpoints |
|-------|-----------|
| **Auth** | `POST /api/auth/google`, `/refresh`, `/logout` |
| **Programs** | `GET/POST /api/programs`, `GET/PATCH/DELETE /api/programs/:id`, `/archive`, `/restore`, `POST /join` |
| **Members** | `GET /api/programs/:id/members`, `GET /api/programs/:programId/members/by-user/:userId`, `POST /leave`, `POST /kick` |
| **Roles** | `GET/POST /api/programs/:id/roles`, `GET/PATCH/DELETE /:roleId`, `POST /members/:memberId/roles` |
| **Categories** | `POST /api/programs/:id/categories`, `PATCH/DELETE /:categoryId`, `POST /reorder` |
| **Channels** | `POST /api/programs/:id/channels`, `PATCH/DELETE /:channelId`, `GET/PUT /:channelId/permissions` |
| **Messages** | `GET/POST /api/channels/:id/messages`, `PATCH/DELETE /:messageId`, `POST/GET /:channelId/read`, `GET /messages/:id/thread`, `POST/DELETE /:channelId/messages/:id/pin`, `GET /:channelId/pinned` |
| **Reactions** | `POST/DELETE /api/messages/:messageId/reactions/:emoji` |
| **DMs** | `GET/POST /api/conversations`, `GET/POST /:id/messages`, `PATCH/DELETE /:id/messages/:msgId`, `GET /:id/messages/:id/thread`, `POST/DELETE /:id/messages/:id/pin`, `GET /:id/pinned` |
| **Upload** | `POST /api/upload` |
| **Users** | `GET /api/users/me`, `GET /api/users/:id`, `PATCH /api/users/me`, `POST /api/users/me/avatar`, `DELETE /api/users/me/avatar`, `GET /api/users/search`, `GET /api/users/:userId/shared-program`, `POST/DELETE /api/users/push-token` |
| **Mute** | `POST/GET /api/channels/:id/mute`, `POST/GET /api/conversations/:id/mute` |
| **Search** | `GET /api/search/messages?q=&scope=&limit=&offset=&programId=` |

### Socket Events (Backend -> Client)

| Category | Events |
|----------|--------|
| **Messages** | `new_message`, `message_updated`, `message_deleted`, `reaction_added`, `reaction_removed`, `thread:reply_added`, `message_pinned`, `message_unpinned` |
| **DMs** | `new_dm_message`, `dm_message_updated`, `dm_message_deleted`, `thread:reply_added`, `message_pinned`, `message_unpinned` |
| **Typing** | `user_typing`, `user_stopped_typing` (enriched with displayName + avatarUrl) |
| **Unread** | `unread:channel`, `unread:dm`, `unread:mention` |
| **Channels** | `channel:created`, `channel:updated`, `channel:deleted`, `channel:moved` |
| **Categories** | `category:created`, `category:updated`, `category:deleted` |
| **Members** | `member:joined`, `member:left`, `member:kicked`, `member:role_changed` |
| **Roles** | `role:created`, `role:updated`, `role:deleted` |
| **Presence** | `user:online`, `user:offline`, `user:profile_updated` (includes all profile fields) |
| **Programs** | `program:updated`, `program:deleted` |

### Socket Events (Client -> Server)

| Event | Purpose |
|-------|---------|
| `authenticate` | Link socket to user ID for presence + personal events |
| `join_channel` / `leave_channel` | Subscribe to channel message room |
| `join_conversation` / `leave_conversation` | Subscribe to DM room |
| `join_program` / `leave_program` | Subscribe to program-wide events |
| `typing_start` / `typing_stop` | Typing indicators |

### Data Models (Prisma - 16 models)

`User` (with bio, bannerColor, statusEmoji, statusText, statusExpiresAt, authProvider), `RefreshToken`, `Program`, `ProgramMembership`, `Role`, `MemberRole`, `Category`, `Channel`, `PermissionOverride`, `Message` (with parentMessageId, replyCount, lastReplyAt, isPinned), `MessageReaction`, `Attachment`, `Conversation`, `ConversationParticipant`, `ChannelRead`, `Invite`, `JoinRequest`, `PushToken`

---

## 5. Known Issues / TODO

### Known Issues
1. **Metro Bundler caching** - Code changes sometimes require `npx expo start --clear` and/or killing port 8081
2. **Backend port conflicts** - `EADDRINUSE` if previous process didn't shut down cleanly (fix: `lsof -ti:3000 | xargs kill -9`)
3. **Presence timing** - Backend uses a 10s grace period before marking user offline; events arriving before a screen's `useEffect` subscribes are missed

### Resolved Issues (Feb 9, 2026)
- ~~Socket reconnection~~ — Now tracks joined rooms (channels, conversations, programs) in Sets and re-emits all joins on reconnect. `reconnectionAttempts` set to Infinity with exponential backoff (max 10s). Rooms cleared on disconnect/logout.
- ~~TypeScript errors~~ — Fixed all 10 pre-existing TS errors: MemberRole missing `position`, Role missing boolean fields, SearchScreen union narrowing, channelStore spread types, MemberProfileScreen optional param.

### UI/UX Audit — Clutter & Complicated Flows (Feb 12, 2026)

The following screens are most likely to feel cluttered or confusing to users:

| # | Screen | Lines | useState | UI Problem |
|---|--------|-------|----------|------------|
| 1 | `ProgramSettingsScreen` | 1,016 | 9 | **4 unrelated concerns on one scroll**: program info editing (inline toggle), invite code management, join request queue, danger zone (archive/delete). Admins approving join requests must scroll past unrelated settings. Inline editing swaps the entire top section between view/edit, making the page feel unstable. |
| 2 | `GroupInfoScreen` | 892 | 16 | **Highest hook count in the app.** Embeds a full add-members modal (search + results list + loading) as inline state (~300 lines). Inline rename toggle, mute management, and member removal all on one screen. The add-members flow is a sub-screen crammed into a modal. |
| 3 | `ChannelManagementScreen` | 876 | 15 | **Dual-modal confusion.** Category modal and channel modal have similar form patterns but different fields. No visual hint about which modal opens until tapped. Admins must understand category-channel hierarchy to use effectively. |
| 4 | `RoleDetailScreen` | 596 | 12 | **Toggle overload.** Edit mode shows 20 permission switches + color palette (10) + tier selector (3) + name input + hoisted/mentionable toggles = **25+ interactive controls** on a single scroll. No grouping or progressive disclosure. |
| 5 | `NewConversationScreen` | 614 | 8 | **Adaptive UI surprise.** UI morphs based on selection count (0→search, 1→"Start Conversation", 2+→group name input + "Create Group"). Sudden appearance of the group name field is unexpected. No explanation of 8-participant limit until hit. |
| 6 | `ProgramDetailScreen` | 848 | 5 + 6 effects | **Socket subscription jungle.** 5+ separate socket subscriptions wired inline. Most complex real-time wiring in the app. Not a user-facing clutter issue, but the code complexity makes it fragile and hard to extend. |

### Simplification Backlog (Feb 12, 2026)

Ordered by impact (user-facing improvement × code health gain):

| # | Target | Problem | Simplification | Effort | Status |
|---|--------|---------|----------------|--------|--------|
| S1 | `ProgramSettingsScreen` | 4 unrelated concerns, 1,016 lines | Split into section components: `ProgramInfoSection`, `InviteCodeSection`, `JoinRequestList`, `DangerZoneSection` in `components/programSettings/`. Orchestrator is now 259 lines (75% reduction). | Medium | **Done (Feb 12)** |
| S2 | `GroupInfoScreen` | 16 hooks, embedded modal | Extracted `AddMembersModal` component. Replaced manual mute with `useMute` hook. Merged mute+leave into one Settings section. Added pull-to-refresh. Removed redundant member count. Screen: 892→624 lines, 16→11 useState. | Medium | **Done (Feb 12)** |
| S3 | `ChannelManagementScreen` | Dual modals, 15 hooks | Extract `CategoryFormModal` + `ChannelFormModal` as standalone components. Eliminates ~8 useState from parent. | Low-Med | **Pending** |
| S4 | `RoleDetailScreen` | 25+ toggles, no grouping | Extracted `PermissionToggleGrid` component (shared with `CreateRoleScreen`). Collapsible categories with count badges and chevrons. RoleDetailScreen: 597→554, CreateRoleScreen: 542→453. ~130 lines of duplicated logic+styles eliminated. | Low | **Done (Feb 12)** |
| S5 | `ProgramDetailScreen` | 5+ socket subscriptions inline | Extract `useProgramSocket(programId)` hook encapsulating all subscriptions. Screen receives callbacks, not raw events. | Medium | **Pending** |
| S6 | `ConversationsListScreen` | 8 event types inline | Extract `useConversationListSocket()` hook. Same pattern as S5. | Low | **Pending** |
| S7 | Duplicated `debounce` | Identical function in `GroupInfoScreen` + `NewConversationScreen` | Extracted to `utils/debounce.ts`. Both screens now import from shared utility. | Trivial | **Done (Feb 12)** |
| S8 | Dead stores | `memberStore` + `roleStore` created but unused | Delete both files. Events are handled in screen components and that's fine. | Trivial | **Pending** |

### Architectural Debt
- `memberStore` and `roleStore` are created but unused — events are handled directly in screen components. Scheduled for deletion (S8).
- Push notifications are code-complete (all 6 chunks) but pending on-device testing.

### UI Revamp — DMs Module (Feb 12, 2026)

**Theme:** Replaced Discord gray palette with premium black/striking-blue/gold (`theme.ts`). True black backgrounds, iOS system blue (#0A84FF), rich gold (#FFD700). All screens inherit automatically.

**Icons:** Replaced ALL emoji UI elements with Ionicons vector icons:
- Tab bar: `grid-outline`, `chatbubbles-outline`, `search-outline` (now respond to active/inactive tint)
- ConversationsListScreen: error, empty, muted, FAB, group badge
- ConversationScreen: empty state, pin indicator
- GroupInfoScreen: mute toggle
- NewConversationScreen: search-empty, initial empty
- MessageActions: overlay color now uses `colors.overlay`

**ConversationsListScreen:** Added "Messages" header bar with compose action. Modernized row design (removed border separators, gap-based spacing, unread-aware styling for name/timestamp/preview).

**ConversationScreen:** Extracted inline header styles to StyleSheet. Replaced all hardcoded `rgba()` values with theme constants (`textOnPrimary`, `highlightBg`, `overlay`). Polished input area.

### Next Features (Priority Order)
1. **Read Receipts / "Seen by"** - Show who has read a message in DMs
2. **Message Forwarding** - Forward a message to another channel or DM
3. **Bookmark / Saved Messages** - Personal bookmarks for messages
4. **Voice messages** - Record and send audio clips

---

## 6. How to Run

### Prerequisites
- Node.js 18+, Xcode (iOS simulator), Expo CLI
- Supabase project (PostgreSQL + Storage)
- Firebase project (Google OAuth)

### Environment Variables

**`backend/.env`** - See `backend/.env.example`:
`DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`

**`mobile/src/constants/config.ts`** - `API_URL` defaults to `http://localhost:3000/api`

### Start Development

```bash
# Backend (terminal 1)
cd backend && npm install && npx prisma generate && npm run dev

# Mobile (terminal 2)
cd mobile && npm install && npx expo start
# Press 'i' for iOS simulator
```

### Multi-device Testing

```bash
xcrun simctl list devices available         # List simulators
xcrun simctl boot "iPhone 16e"              # Boot second simulator
# Log in as different users on each simulator for real-time testing
```

### Useful Commands

```bash
npx prisma studio                          # Browse database
npx prisma db push --force-reset           # Reset database
npx expo start --clear                     # Clear Metro cache
lsof -ti:3000 | xargs kill -9             # Kill stuck backend
lsof -ti:8081 | xargs kill -9             # Kill stuck Metro
```

---

## 7. Architecture Notes for Continuation

### Real-time Event Pattern
Every backend mutation that changes shared state emits a socket event. The pattern is:
1. Backend route performs DB mutation via Prisma
2. Gets `io` from `req.app.get('io')`
3. Emits event to the relevant room (`program:{id}`, `user:{id}`, `channel:{id}`)
4. Mobile screens subscribe in `useEffect(() => { const unsub = subscribeToXEvents({...}); return unsub; }, [deps])`
5. Handlers update local component state (not Zustand) for most screens

**Socket reconnection:** The client tracks all joined rooms in `Set`s (`joinedChannels`, `joinedConversations`, `joinedPrograms`). On the `connect` event (which fires on initial connect and every reconnect), all rooms are re-joined automatically. `reconnectionAttempts` is set to `Infinity` with exponential backoff (1s-10s). Room sets are cleared on `disconnectSocket()` and `clearSocketAuth()` (logout).

### Zustand Store Usage
- `authStore` - User session, login/logout, `updateUser()` for profile changes (includes bio, bannerColor, statusEmoji, statusText, statusExpiresAt, authProvider, createdAt)
- `presenceStore` - Global `onlineUsers` map, used across screens
- `channelStore` - Tracks `hasUnread` and `mentionCount` per channel
- `muteStore` - Per-channel and per-conversation mute state. Hooks use Zustand selectors for stable action references (avoids full-store re-renders)
- `memberStore` / `roleStore` - Created but events are handled directly in screen components

### Cross-Module Shared Hooks (Feb 9, 2026 refactor)

The three chat screens (`ChannelScreen`, `ConversationScreen`, `ThreadScreen`) share ~800 lines of duplicated logic that was extracted into reusable hooks:

| Hook | Purpose | Used by |
|------|---------|---------|
| `useReactions` | Reaction add/toggle via API + socket event helpers (`applyReactionAddedSingle`, `applyReactionRemovedSingle`) | All 3 chat screens |
| `useMessageActions` | Action sheet open/close state, typed for any message type | All 3 chat screens |
| `useMessageHighlight` | Scroll-to-index + fade animation on `highlightMessageId` param, with timeout cleanup | Channel, Conversation |
| `useAttachments` | File selection, picker visibility, upload progress state | Channel, Conversation |
| `useMute` | Fetch + optimistic toggle mute status; uses Zustand selectors for stable deps | Channel, Conversation |
| `useMessageEdit` | Inline edit state + save API; generic `EditApiFn<T>` for type safety | Channel, Conversation |

**ProfileScreen** was similarly decomposed into `useAvatar`, `useEditProfile`, `useCustomStatus` hooks + `EditProfileModal` and `StatusModal` components.

**`MessageActions` component** was rebuilt to unify the old separate `ReactionPicker` modal into a single Discord-style bottom sheet with a quick-react emoji row at the top, grouped action sections with Ionicons, and visual dividers.

**`dateFormatters.ts`** centralizes `formatMessageTime`, `formatRelativeTime`, `formatDateHeader`, and `shouldShowDateHeader` — all using calendar-day comparison (not elapsed-time math) for correct Today/Yesterday boundaries near midnight.

### Permission Check Flow
1. API route calls `checkPermission(req, programId, PERMISSION_BIT)`
2. Middleware loads user's membership + roles for that program
3. Combines all role permissions via bitwise OR
4. Super Admin (`isSuperAdmin`) and Owner (tier 0) bypass all checks

### Profile System
- **ProfileScreen** (own profile): Thin orchestrator (~400 lines) composing `useAvatar`, `useEditProfile`, `useCustomStatus` hooks + `EditProfileModal` and `StatusModal` components. Displays Discord-style card with banner, avatar, identity, status pill, bio. Full editing via modals: avatar upload (expo-image-picker -> Supabase), banner color picker (preset palette), display name, bio (markdown-enabled, 280 chars), custom status (emoji + text + duration picker with 10s/1h/4h/today/don't clear options), and read-only account info section
- **MemberProfileScreen** (other users): Rich Discord-style card with colored banner, avatar ring, role badges (owner/admin), presence pill, custom status pill, bio with markdown rendering. Navigable via `memberId` or `userId` param
- **UserAvatar component** (`mobile/src/components/UserAvatar.tsx`): Reusable across all screens. Renders uploaded image with `onError` fallback to initial-letter circle. Deterministic avatar color from name. Optional status dot with configurable color/size
- **Profile navigation from messages**: Tapping an avatar in `ChannelScreen` navigates to `MemberProfile` with `programId` + `userId`. In `ConversationScreen`, calls `GET /api/users/:userId/shared-program` first to find a common program, then navigates. Shows alert if no shared program exists
- **Status expiration**: Real-time via `useEffect` + `setTimeout` that fires exactly at `statusExpiresAt`. `cleanExpiredStatus` helper on backend strips expired status fields from responses
- **Avatar tab icon**: Profile tab in bottom navigation shows the user's avatar image (with `onError` fallback to initial)

### Message Search
- Backend: `GET /api/search/messages` with `q`, `scope` (all/channels/dms), `limit`, `offset`, `programId` params
- Access control: only searches channels the user is a member of and conversations they participate in
- Case-insensitive via PostgreSQL `ILIKE`; min query length of 2 characters
- Mobile: `SearchScreen` renders as the Search tab (replaced Notifications tab), with debounced input (350ms), scope filter tabs, and paginated results
- Tapping a result navigates to `ChannelScreen` or `ConversationScreen` with `highlightMessageId` param
- Scroll-to-highlight: both screens use `scrollToIndex` + `Animated.View` with a 2s fade-out blue highlight
- Cancel button navigates to Programs tab via `navigation.navigate('Programs')` (since SearchScreen is a tab screen, `navigation` is the tab navigator)
- Test script: `backend/scripts/test-search.ts` — 52 tests covering validation, scopes, pagination, access control, special characters

### MarkdownText Component
- Custom inline markdown parser at `mobile/src/components/MarkdownText.tsx`
- Supports: `**bold**`, `*italic*`, `` `code` ``, `~~strikethrough~~`, `_italic_`, `__bold__`
- Used in bio rendering on `ProfileScreen` and `MemberProfileScreen`

### Expo Go Compatibility
- `expo-notifications` is a native module that crashes in Expo Go (simulator)
- `notifications.ts` lazily requires `expo-notifications` and `expo-device` inside a try-catch
- All exported functions check `isAvailable()` and no-op gracefully when the native module is missing
- This allows the app to run fully in Expo Go for development (push notifications are simply disabled)

### BigInt Serialization
Prisma `BigInt` fields (permissions) require JSON serialization handling. The backend transforms them to strings before sending responses.

---

## Programs Module UI Redesign (Feb 2026)

A ground-up redesign of the entire Programs module for a professional, mobile-first experience.

### Design Philosophy Applied
- **Thumb-first**: Primary actions (FAB, bottom bar) placed in thumb zone
- **Gesture hierarchy**: Tap for primary action, long-press for context menu, `...` overflow as fallback
- **44pt minimum touch targets** on all interactive rows
- **Progressive disclosure**: Collapsible descriptions, context menus instead of inline buttons
- **Tactile feedback**: `expo-haptics` on FAB, action strip, context menus, destructive actions
- **Consistent Ionicons**: All emojis replaced with `@expo/vector-icons/Ionicons` across 13 screens
- **Centralized theme colors**: Tier colors (`tierOwner`, `tierAdmin`, `tierModerator`, `tierMember`, `roleDefault`) added to `theme.ts`

### Screens Redesigned
| Screen | Key Changes |
|--------|-------------|
| **ProgramsScreen** | 2-column grid cards with `Pressable` scale animation, FAB + bottom sheet for add options, unread badges |
| **ProgramDetailScreen** | Hero header, collapsible description, 4-button action strip (Members/Roles/Settings/Invite), `#`/Ionicons for channel types, 44pt channel rows |
| **ChannelManagementScreen** | Long-press + `...` overflow context menu (bottom sheet), bottom action bar for New Category / New Channel, removed top legend |
| **ChannelScreen** | Replaced highlight hardcode with `colors.highlightBg`, Ionicons empty state |
| **PinnedMessagesScreen** | Ionicons for pin/unpin icons |
| **MemberDirectoryScreen** | Ionicons for badges (star/shield/chevron), theme tier colors, removed heavy separators |
| **MemberProfileScreen** | Ionicons for actions, theme colors for banner/badges/roles |
| **RolesListScreen** | Ionicons for badges + FAB, centralized tier colors |
| **RoleDetailScreen** | Centralized tier colors in tier options + getTierColor |
| **CreateRoleScreen** | Centralized tier colors in tier options |
| **CreateProgramScreen** | Ionicons for privacy icons + back/close button |
| **JoinProgramScreen** | Ionicons for header icon |
| **ChannelPermissionsScreen** | Ionicons for lock icon |

### Files Modified
- `mobile/src/constants/theme.ts` — Added `tierOwner`, `tierAdmin`, `tierModerator`, `tierMember`, `roleDefault` color constants
- `mobile/src/screens/ProgramsScreen.tsx` — Complete rewrite: 2-column FlatList grid, ProgramCard component, FAB, Modal bottom sheet
- `mobile/src/screens/ProgramDetailScreen.tsx` — Major rewrite: action strip, collapsible description, channel icon system, increased tap targets
- `mobile/src/screens/ChannelManagementScreen.tsx` — Complete rewrite: context menu via ContextTarget state, bottom action bar, long-press + overflow
- `mobile/src/screens/ChannelScreen.tsx` — Targeted edits: Ionicons empty state, theme highlight color
- `mobile/src/screens/PinnedMessagesScreen.tsx` — Targeted edits: Ionicons for pin icons
- `mobile/src/screens/MemberDirectoryScreen.tsx` — Targeted edits: Ionicons badges, theme tier colors, lighter separators
- `mobile/src/screens/MemberProfileScreen.tsx` — Targeted edits: Ionicons actions, theme colors for banner/badges/roles
- `mobile/src/screens/RolesListScreen.tsx` — Targeted edits: Ionicons, centralized tier colors
- `mobile/src/screens/RoleDetailScreen.tsx` — Targeted edits: centralized tier colors
- `mobile/src/screens/CreateRoleScreen.tsx` — Targeted edits: centralized tier colors
- `mobile/src/screens/CreateProgramScreen.tsx` — Targeted edits: Ionicons for privacy/nav icons
- `mobile/src/screens/JoinProgramScreen.tsx` — Targeted edits: Ionicons header
- `mobile/src/screens/ChannelPermissionsScreen.tsx` — Targeted edits: Ionicons lock icon
