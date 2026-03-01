# InternHub — Architecture

Technical architecture, design patterns, and codebase structure.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Authentication Flow](#4-authentication-flow)
5. [Real-Time Architecture](#5-real-time-architecture)
6. [Data Models](#6-data-models)
7. [Permission System](#7-permission-system)
8. [State Management](#8-state-management)
9. [Navigation Structure](#9-navigation-structure)
10. [Key Patterns](#10-key-patterns)
11. [External Services](#11-external-services)
12. [File Upload Flow](#12-file-upload-flow)

---

## 1. System Overview

```
┌─────────────────┐        HTTPS / WSS        ┌─────────────────┐
│                 │ ◄──────────────────────── │                 │
│   React Native  │     REST API (Express)     │   Node.js       │
│   Mobile App    │ ────────────────────────► │   Backend       │
│   (Expo)        │                            │   (Express +    │
│                 │ ◄──── Socket.io ──────►   │    Socket.io)   │
└─────────────────┘                            └────────┬────────┘
                                                        │
                              ┌──────────────────────────┼──────────────────────────┐
                              │                          │                          │
                    ┌─────────▼─────────┐    ┌──────────▼──────────┐    ┌─────────▼─────────┐
                    │   PostgreSQL      │    │   Supabase Storage  │    │   Firebase Auth   │
                    │   (Supabase)      │    │   (Attachments)     │    │   (Google OAuth)  │
                    │   via Prisma ORM  │    │                     │    │                   │
                    └───────────────────┘    └─────────────────────┘    └───────────────────┘
```

**Request lifecycle:**
1. Mobile sends HTTP requests to Express REST API for CRUD operations
2. Backend performs database operations via Prisma
3. Backend emits Socket.io events to relevant rooms for real-time updates
4. Mobile listens for socket events and updates local state
5. File uploads go through Express (multer) → Supabase Storage

---

## 2. Tech Stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 18+ | Server runtime |
| Framework | Express 4 | HTTP routing, middleware |
| WebSockets | Socket.io 4 | Real-time bidirectional communication |
| ORM | Prisma 5 | Database access and migrations |
| Database | PostgreSQL | Primary data store (hosted on Supabase) |
| File Storage | Supabase Storage | Avatar and attachment uploads |
| Auth Verification | Firebase Admin SDK | Verifies Google Sign-In ID tokens |
| JWT | jsonwebtoken | Access/refresh token issuance and verification |
| File Uploads | multer 2 | Multipart form data parsing |
| Validation | Zod | Request body/query validation |
| Security | helmet, cors | HTTP security headers, CORS |
| Logging | morgan | HTTP request logging |
| Push | expo-server-sdk | Expo Push Notification delivery |

### Mobile

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React Native (Expo SDK 54) | Cross-platform mobile UI |
| Language | TypeScript | Type safety |
| Navigation | React Navigation 7 | Stack + tab navigation |
| HTTP | Axios | REST API client with interceptors |
| WebSockets | socket.io-client | Real-time events |
| State | Zustand | Global state stores |
| Auth | @react-native-google-signin | Native Google Sign-In |
| Auth | Firebase (JS SDK) | Firebase ID token generation |
| Secure Storage | expo-secure-store | JWT token storage |
| Local Storage | @react-native-async-storage | Draft messages, preferences |
| Push | expo-notifications | Push notification handling |
| UI | Ionicons (@expo/vector-icons) | Icon system |
| Haptics | expo-haptics | Tactile feedback |
| Media | expo-image-picker, expo-document-picker | File selection |

---

## 3. Folder Structure

### Backend

```
backend/
├── prisma/
│   ├── schema.prisma          # 16 models, enums, indexes
│   ├── migrations/            # Prisma migration history
│   └── seed.ts                # Seeds super admin, default program, roles, categories, channels
├── src/
│   ├── config/
│   │   ├── index.ts           # Env var loading and validation
│   │   ├── database.ts        # Prisma client singleton
│   │   ├── firebase.ts        # Firebase Admin SDK initialization
│   │   └── supabase.ts        # Supabase client for storage
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification (authenticate, optionalAuth, requireSuperAdmin)
│   │   └── errorHandler.ts    # Global error handler (Prisma, JWT, Zod, AppError)
│   ├── routes/
│   │   ├── auth.routes.ts     # Firebase auth, token refresh, logout
│   │   ├── program.routes.ts  # Programs, categories, channels, members, invites, join requests
│   │   ├── channel.routes.ts  # Channel messages, read status, mute, pinning
│   │   ├── conversation.routes.ts  # DMs, group DMs, participants
│   │   ├── reaction.routes.ts # Add/remove/list reactions, common emojis
│   │   ├── role.routes.ts     # Role CRUD, member role assignment
│   │   ├── user.routes.ts     # Profile, avatar, search, push tokens
│   │   ├── search.routes.ts   # Message and channel search
│   │   └── upload.routes.ts   # File upload to Supabase Storage
│   ├── utils/
│   │   ├── jwt.ts             # Token generation and verification
│   │   └── permissions.ts     # Bitfield permission utilities
│   └── index.ts               # App entry: Express setup, Socket.io, route mounting
├── package.json
└── tsconfig.json
```

### Mobile

```
mobile/
├── src/
│   ├── components/
│   │   ├── UserAvatar.tsx           # Avatar with image/initial fallback + status dot
│   │   ├── MarkdownText.tsx         # Inline markdown renderer
│   │   ├── MessageInput.tsx         # Message composer with attachment support
│   │   ├── MessageActions.tsx       # Long-press action sheet (react, reply, pin, edit, delete)
│   │   ├── ReactionBar.tsx          # Emoji reaction display under messages
│   │   ├── SwipeableMessage.tsx     # Swipe-right-to-reply gesture
│   │   ├── ThreadIndicator.tsx      # Thread reply count + avatars
│   │   ├── TypingIndicator.tsx      # Animated typing dots
│   │   ├── ChatStates.tsx           # Loading spinner and error retry states
│   │   ├── ConnectionBanner.tsx     # Socket connection status banner
│   │   ├── ScrollToBottomFAB.tsx    # Scroll-to-bottom floating button
│   │   ├── EditProfileModal.tsx     # Edit name, bio, banner color
│   │   ├── StatusModal.tsx          # Set custom status (emoji, text, duration)
│   │   ├── AddMembersModal.tsx      # Search and add members to group DMs
│   │   ├── FileCard.tsx             # File attachment display card
│   │   ├── AttachmentPicker.tsx     # File selection UI
│   │   ├── AttachmentPreview.tsx    # Selected file preview before sending
│   │   ├── MentionAutocomplete.tsx  # @mention suggestion dropdown
│   │   ├── PermissionToggleGrid.tsx # Permission checkbox grid
│   │   └── programSettings/        # Program settings section components
│   │       ├── ProgramInfoSection.tsx
│   │       ├── InviteCodeSection.tsx
│   │       ├── JoinRequestList.tsx
│   │       └── DangerZoneSection.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── ProgramsScreen.tsx
│   │   ├── ProgramDetailScreen.tsx
│   │   ├── ProgramSettingsScreen.tsx
│   │   ├── CreateProgramScreen.tsx
│   │   ├── JoinProgramScreen.tsx
│   │   ├── ChannelScreen.tsx
│   │   ├── ChannelManagementScreen.tsx
│   │   ├── ChannelPermissionsScreen.tsx
│   │   ├── ConversationsListScreen.tsx
│   │   ├── ConversationScreen.tsx
│   │   ├── NewConversationScreen.tsx
│   │   ├── GroupInfoScreen.tsx
│   │   ├── ThreadScreen.tsx
│   │   ├── PinnedMessagesScreen.tsx
│   │   ├── SearchScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── MemberDirectoryScreen.tsx
│   │   ├── MemberProfileScreen.tsx
│   │   ├── RolesListScreen.tsx
│   │   ├── RoleDetailScreen.tsx
│   │   ├── CreateRoleScreen.tsx
│   │   └── AssignRolesScreen.tsx
│   ├── hooks/
│   │   ├── useDraft.ts              # AsyncStorage-backed message drafts
│   │   ├── useReactions.ts          # Reaction add/toggle/socket-apply
│   │   ├── useMessageActions.ts     # Action sheet state
│   │   ├── useMessageHighlight.ts   # Scroll-to-highlight with animation
│   │   ├── useAttachments.ts        # File selection, upload progress
│   │   ├── useMute.ts              # Channel/DM mute toggle
│   │   ├── useMessageEdit.ts       # Inline message edit state + save
│   │   ├── useAvatar.ts            # Avatar upload, remove, action sheet
│   │   ├── useEditProfile.ts       # Edit profile modal state + save
│   │   └── useCustomStatus.ts      # Custom status draft, timer, save
│   ├── services/
│   │   ├── api.ts                   # Axios client + all API namespaces
│   │   ├── socket.ts               # Socket.io client + typed event subscriptions
│   │   ├── firebase.ts             # Firebase app initialization
│   │   ├── notifications.ts        # Push notification setup + deep linking
│   │   └── navigationRef.ts        # Imperative navigation for deep links
│   ├── store/
│   │   ├── authStore.ts            # User session, tokens, push registration
│   │   ├── channelStore.ts         # Unread channel state
│   │   ├── presenceStore.ts        # Online/offline user map
│   │   ├── muteStore.ts            # Per-channel/DM mute state
│   │   ├── connectionStore.ts      # Socket connection status
│   │   ├── notificationStore.ts    # Push token state
│   │   ├── memberStore.ts          # Member events (placeholder)
│   │   └── roleStore.ts            # Role events (placeholder)
│   ├── constants/
│   │   ├── config.ts               # API URLs, Firebase config, app constants
│   │   └── theme.ts                # Colors, spacing, typography, shadows
│   ├── navigation/
│   │   └── AppNavigator.tsx        # Stack + bottom tab navigator
│   ├── types/
│   │   └── index.ts                # All TypeScript interfaces
│   └── utils/
│       ├── dateFormatters.ts       # Date/time display utilities
│       └── debounce.ts             # Debounce utility
├── App.tsx                          # Root component with auth state gating
├── app.json                         # Expo configuration
├── package.json
└── tsconfig.json
```

---

## 4. Authentication Flow

```
Mobile                           Firebase                        Backend
──────                           ────────                        ───────
1. User taps "Sign in"
2. Google Sign-In SDK ──────►
   Native OAuth flow
3. ◄── Google credential
4. signInWithCredential() ──►
   Firebase Auth
5. ◄── Firebase ID token
6. POST /api/auth/firebase ──────────────────────────────────► 7. Verify ID token
   { idToken }                                                    (Firebase Admin SDK)
                                                                8. Find or create User
                                                                9. Generate JWT pair
10. ◄──────────────────────────────────────────────────────────  { accessToken, refreshToken, user }
11. Store tokens in
    SecureStore
12. Set Axios interceptor
    for Authorization header
13. Connect Socket.io
14. Emit 'authenticate' ────────────────────────────────────► 15. Verify JWT
    with accessToken                                             Join user:{id} room
                                                                 Mark user online
```

**Token refresh:**
- Access tokens expire in 15 minutes
- When a 401 is received, the Axios interceptor automatically calls `POST /api/auth/refresh`
- If refresh fails, the user is logged out

---

## 5. Real-Time Architecture

### Socket.io Room System

The backend uses Socket.io rooms to scope event delivery:

| Room Pattern | Joined When | Events Received |
|-------------|-------------|-----------------|
| `user:{userId}` | On authenticate | DM unreads, group DM lifecycle, personal notifications |
| `program:{programId}` | On join_program | Member joins, channel/category CRUD, role changes, presence |
| `channel:{channelId}` | On join_channel | New messages, edits, deletes, reactions, threads, pins |
| `conversation:{conversationId}` | On join_conversation | DM messages, edits, deletes, reactions, typing |

### Event Flow (example: sending a channel message)

```
Mobile A                    Backend                     Mobile B
────────                    ───────                     ────────
POST /api/channels/:id
  /messages
  { content }
                            1. Create message in DB
                            2. io.to('channel:123')
                               .emit('new_message', msg)
                            3. io.to('program:456')
                               .emit('unread:channel', {...})
                            4. Send push notifications
                               (if recipients offline)
                                                        onNewMessage callback
                                                        → prepend to messages array
                                                        onUnreadChannel callback
                                                        → update channelStore
```

### Reconnection

On reconnect, the socket client:
1. Re-emits `authenticate` with the current JWT
2. Re-joins all tracked rooms (channels, conversations, programs)
3. Rooms are tracked in `Set<string>` objects on the client side

---

## 6. Data Models

### Entity Relationship Diagram (simplified)

```
User ──┬── ProgramMembership ──┬── Program
       │                       │
       │                       ├── Role ─── MemberRole
       │                       │
       │                       ├── Category ─── Channel ─── Message ──┬── MessageReaction
       │                       │                                      ├── Attachment
       │                       │                                      └── (self: Thread replies)
       │                       │
       │                       ├── PermissionOverride
       │                       │
       │                       ├── Invite
       │                       └── JoinRequest
       │
       ├── ConversationParticipant ─── Conversation ─── Message
       │
       ├── RefreshToken
       ├── PushToken
       └── ChannelRead
```

### Key Models

| Model | Fields (key) | Purpose |
|-------|-------------|---------|
| **User** | email, displayName, avatarUrl, bio, bannerColor, statusEmoji/Text/ExpiresAt, isSuperAdmin, authProvider | User account and profile |
| **Program** | name, description, ownerId, inviteCode, isDefault, isPrivate, status | Organizational unit |
| **ProgramMembership** | userId, programId, nickname | User ↔ Program join table |
| **Role** | programId, name, color, tier (0-3), permissions (BigInt bitfield), isEveryone, isHoisted | Per-program role |
| **MemberRole** | membershipId, roleId | Membership ↔ Role join table |
| **Category** | programId, name, position | Channel grouping |
| **Channel** | programId, categoryId, name, type (TEXT/ANNOUNCEMENT), topic, isPrivate | Communication channel |
| **Message** | content, authorId, channelId/conversationId, parentMessageId, isEdited, isPinned | Message (shared for channels and DMs) |
| **Conversation** | isGroup, groupName, createdById | DM conversation |
| **ConversationParticipant** | conversationId, userId, lastReadAt, isMuted | DM participant |

---

## 7. Permission System

### Bitfield Permissions

Permissions are stored as a BigInt bitfield (20 bits). Each permission is a power of 2:

```
Bit 0:  ADMINISTRATOR        (1)
Bit 1:  MANAGE_PROGRAM        (2)
Bit 2:  MANAGE_ROLES          (4)
Bit 3:  MANAGE_CHANNELS       (8)
...
Bit 9:  SEND_MESSAGES        (512)
Bit 10: SEND_IN_ANNOUNCEMENTS (1024)
...
Bit 15: MANAGE_MESSAGES      (32768)
```

**Checking permissions:**
```typescript
const hasPermission = (userPerms: bigint, requiredPerm: bigint) =>
  (userPerms & requiredPerm) === requiredPerm;
```

### Permission Resolution

1. Collect all roles assigned to the member
2. Combine their permissions with bitwise OR
3. If any role has `ADMINISTRATOR`, grant all permissions
4. If the user is `isSuperAdmin`, bypass all checks
5. For private channels, check `PermissionOverride` entries

### Tier Hierarchy

When modifying roles, the backend enforces:
- You can only manage roles at a tier **higher** (numerically) than your highest role
- Owner (tier 0) can manage all roles
- Admin (tier 1) can manage tier 2 and 3 roles
- Members cannot manage any roles

---

## 8. State Management

### Zustand Stores

| Store | Key State | Used By |
|-------|-----------|---------|
| `authStore` | user, tokens, isAuthenticated, socket init | App.tsx, all authenticated screens |
| `channelStore` | unreadChannels map, mentionCounts | ProgramDetail, Channel list |
| `presenceStore` | onlineUsers set | MemberDirectory, MemberProfile, UserAvatar |
| `muteStore` | mutedChannels, mutedConversations | Channel, Conversation, lists |
| `connectionStore` | isConnected, isConnecting | ConnectionBanner |
| `notificationStore` | pushToken, permissionStatus | Auth flow, push registration |

### Local State Patterns

Each screen manages its own data via `useState` + `useEffect`:
1. Fetch data from API on mount
2. Subscribe to relevant socket events
3. Update local state on socket events
4. Return cleanup function to unsubscribe

This pattern avoids a centralized store for entity data while still getting real-time updates.

---

## 9. Navigation Structure

```
Root Stack Navigator
├── Login (unauthenticated)
└── Main (authenticated)
    └── Bottom Tab Navigator
        ├── Programs Tab
        │   └── ProgramsScreen
        ├── Messages Tab
        │   └── ConversationsListScreen
        ├── Search Tab
        │   └── SearchScreen
        └── Profile Tab
            └── ProfileScreen

    Stack Screens (overlay on any tab):
    ├── ProgramDetail
    ├── Channel
    ├── ChannelManagement
    ├── ChannelPermissions
    ├── Conversation
    ├── NewConversation (modal)
    ├── GroupInfo
    ├── Thread
    ├── PinnedMessages
    ├── MemberDirectory
    ├── MemberProfile
    ├── RolesList
    ├── RoleDetail
    ├── CreateRole (modal)
    ├── AssignRoles (modal)
    ├── CreateProgram (modal)
    ├── JoinProgram (modal)
    └── ProgramSettings
```

**Deep linking** from push notifications navigates directly to the relevant screen using an imperative navigation ref.

---

## 10. Key Patterns

### API Client (Axios Interceptors)

```
Request Interceptor:
  → Attach Authorization: Bearer <accessToken>

Response Interceptor (on 401):
  → Call POST /api/auth/refresh with refreshToken
  → If success: retry original request with new token
  → If failure: call onTokenRefreshFailed → logout
```

### Socket Event Subscription Pattern

Every screen that needs real-time updates follows this pattern:

```typescript
useEffect(() => {
  const unsubscribe = subscribeToChannelEvents({
    onNewMessage: (message) => {
      setMessages(prev => [message, ...prev]);
    },
    onMessageDeleted: ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    },
  });

  return () => unsubscribe();
}, [channelId]);
```

The `subscribe*` functions return cleanup functions that remove all listeners.

### Custom Hooks

Shared logic is extracted into hooks to avoid duplication across Channel, Conversation, and Thread screens:

- `useReactions` — Reaction toggle logic + socket event application
- `useMute` — Fetch/toggle mute state for any channel or conversation
- `useDraft` — Debounced draft persistence to AsyncStorage
- `useAttachments` — File picker integration + upload state
- `useMessageEdit` — Inline edit mode state management
- `useMessageHighlight` — Scroll-to-message with fade-in/out highlight

### Optimistic Updates

The app uses optimistic patterns where possible:
- Marking a channel as read updates the client store immediately
- Sending a message shows it instantly (the server-confirmed version replaces it via socket)

---

## 11. External Services

### Supabase

**Database (PostgreSQL):**
- Connected via Prisma ORM
- Two connection strings: pooled (app) and direct (migrations)
- All 16 models with indexes, relations, and cascading deletes

**Storage:**
- Bucket: `attachments` (public)
- Used for: user avatars, message file attachments
- Upload flow: Express (multer) → Supabase Storage SDK → public URL returned
- Files are stored with a path pattern: `channel/{channelId}/{timestamp}_{filename}` or `avatars/{userId}/{timestamp}_{filename}`

### Firebase

**Authentication:**
- Google Sign-In → Firebase Auth → ID token
- Backend verifies ID tokens using Firebase Admin SDK
- User accounts are created in the PostgreSQL database (Firebase is only used for the OAuth step)

### Expo Push Notifications

- Push tokens are registered via `POST /api/users/push-token`
- Notifications are sent server-side using `expo-server-sdk`
- Triggered on: new channel messages, DMs, @mentions, thread replies
- Deep links in notifications navigate to the relevant screen

---

## 12. File Upload Flow

```
Mobile                              Backend                          Supabase Storage
──────                              ───────                          ────────────────
1. Pick file (image-picker
   or document-picker)
2. POST /api/upload/channel/:id
   Content-Type: multipart/form-data
   [file data + optional content]
                                    3. multer parses file
                                    4. Upload to Supabase ──────►  5. Store file
                                       Storage bucket                  Return public URL
                                    6. Create Message + Attachment
                                       records in PostgreSQL
                                    7. Emit 'new_message' via
                                       Socket.io to channel room
                                    8. Return message + attachment
                                       data to sender
9. Display message with
   attachment card
                                                                    Receivers see message
                                                                    via socket event
```
