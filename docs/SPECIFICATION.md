# InternHub - Mobile Collaboration Platform Specification

## 1. Project Overview

**Product Name:** InternHub

**GitHub Repository:** `gaoex_internship_messaging_platform`

**Purpose:** A mobile-first team collaboration platform (Discord-style) designed specifically for internship programs, enabling facilitators and students to communicate, share resources, and collaborate effectively.

**Target Users:**

- Super Admin (Platform-wide administrator)
- Program Owners (Create and manage individual programs)
- Custom Roles (Facilitators, mentors, team leads - configurable per program)
- Students/Interns (Enrolled participants)

**Key Design Decisions:**

- Roles are **program-specific** (a Facilitator in one program has no special permissions in other programs)
- All users auto-join a **Default Program** on signup
- Custom roles with **20 granular permissions** (Discord-style)
- Per-channel **permission overrides** for fine-grained access control

---

## 2. Project Configuration

### Agreed Settings

| Setting | Value |
|---------|-------|
| Project Name | InternHub |
| GitHub Repo | `gaoex_internship_messaging_platform` |
| Repo Structure | **Monorepo** (`/mobile` + `/backend`) |
| Default Program Name | "Educational Research Group" (renameable by Super Admin) |
| Design Style | Discord-like with **blue and gold** accents |
| OAuth Providers | Google + Facebook (placeholder config initially) |
| Mobile Priority | **iOS first**, then Android |
| Build Order | Backend first, then Mobile |

### Monorepo Structure

```
gaoex_internship_messaging_platform/
├── backend/
│   ├── src/
│   │   ├── config/           # Environment, database config
│   │   ├── controllers/      # Route handlers
│   │   ├── middleware/       # Auth, permissions, validation
│   │   ├── routes/           # API route definitions
│   │   ├── services/         # Business logic
│   │   ├── socket/           # WebSocket handlers
│   │   └── utils/            # Helpers, constants
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   ├── migrations/       # Migration files
│   │   └── seed.ts           # Seed Default Program + Super Admin
│   ├── package.json
│   └── tsconfig.json
├── mobile/
│   ├── src/
│   │   ├── api/              # API client, endpoints
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── navigation/       # React Navigation setup
│   │   ├── screens/          # Screen components
│   │   ├── store/            # State management
│   │   ├── services/         # Socket, push notifications
│   │   ├── theme/            # Colors, typography (blue/gold)
│   │   └── types/            # TypeScript types
│   ├── ios/                  # iOS native code
│   ├── android/              # Android native code (later)
│   ├── app.json
│   └── package.json
├── docs/
│   └── SPECIFICATION.md      # This file
├── .gitignore
├── .env.example
└── README.md
```

### Design Theme

| Element | Color |
|---------|-------|
| Primary | Blue (`#3B82F6` or similar) |
| Accent | Gold (`#F59E0B` or similar) |
| Background (Dark) | Dark gray (`#1F2937`) |
| Surface (Dark) | Darker gray (`#111827`) |
| Text (Dark) | White/Light gray |

*Exact color values will be finalized during mobile development.*

---

## 3. Technology Stack

### Mobile App (Frontend)

- **Framework:** React Native (iOS + Android from single codebase)
- **State Management:** Redux Toolkit or Zustand
- **Navigation:** React Navigation v6
- **UI Components:** React Native Paper or NativeBase
- **Real-time:** Socket.io-client
- **Push Notifications:** Firebase Cloud Messaging (FCM) + Apple Push Notification Service (APNs)

### Backend

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** PostgreSQL (primary) + Redis (caching, session management)
- **ORM:** Prisma
- **Real-time:** Socket.io
- **File Storage:** AWS S3 or Cloudinary
- **Authentication:** Passport.js (Google OAuth 2.0, Facebook OAuth)

### Infrastructure

- **Hosting:** AWS (EC2/ECS) or Railway/Render for MVP
- **Database Hosting:** AWS RDS or Supabase
- **CDN:** CloudFront or Cloudflare

---

## 4. Roles and Permissions System (Discord-Style)

### Overview

InternHub uses a **custom roles system** similar to Discord, allowing program owners to create roles with specific permissions tailored to their program's needs.

### Role Hierarchy Rules

1. **Position-based authority:** Higher position roles can manage lower position roles
2. **Additive permissions:** Users with multiple roles get combined permissions
3. **Owner immunity:** Program owners have all permissions, cannot be modified
4. **@everyone:** Default role that all program members have (position 0)

### Role Properties

| Property | Description |
|----------|-------------|
| `name` | Display name (e.g., "Mentor", "Team Lead", "Week 1 Cohort") |
| `color` | Hex color displayed on member names in chat |
| `position` | Hierarchy position (higher = more authority) |
| `isHoisted` | If true, members shown separately in member list |
| `isMentionable` | If true, role can be @mentioned by anyone |
| `permissions` | Bitfield of granted permissions |

### Granular Permissions (20 total)

#### Program Management Permissions

| Permission | Bit | Description |
|------------|-----|-------------|
| `ADMINISTRATOR` | 1 << 0 | Full access, bypasses all permission checks |
| `MANAGE_PROGRAM` | 1 << 1 | Edit program name, description, settings |
| `MANAGE_ROLES` | 1 << 2 | Create, edit, delete roles below your highest role |
| `MANAGE_CHANNELS` | 1 << 3 | Create, edit, delete, reorder channels and categories |
| `KICK_MEMBERS` | 1 << 4 | Remove members from the program |
| `BAN_MEMBERS` | 1 << 5 | Permanently ban members from the program |
| `INVITE_MEMBERS` | 1 << 6 | Create and share invite links |
| `VIEW_AUDIT_LOG` | 1 << 7 | View program activity log |

#### Channel Permissions

| Permission | Bit | Description |
|------------|-----|-------------|
| `VIEW_CHANNELS` | 1 << 8 | See channels (base visibility) |
| `SEND_MESSAGES` | 1 << 9 | Post messages in text channels |
| `SEND_IN_ANNOUNCEMENTS` | 1 << 10 | Post in announcement channels |
| `EMBED_LINKS` | 1 << 11 | URLs show link previews |
| `ATTACH_FILES` | 1 << 12 | Upload files and images |
| `MENTION_EVERYONE` | 1 << 13 | Use @everyone and @here |
| `MENTION_ROLES` | 1 << 14 | @mention any role |
| `MANAGE_MESSAGES` | 1 << 15 | Delete or pin any member's messages |
| `READ_MESSAGE_HISTORY` | 1 << 16 | View messages sent before joining |

#### Member Permissions

| Permission | Bit | Description |
|------------|-----|-------------|
| `CHANGE_NICKNAME` | 1 << 17 | Change own display name |
| `MANAGE_NICKNAMES` | 1 << 18 | Change other members' nicknames |
| `TIMEOUT_MEMBERS` | 1 << 19 | Temporarily mute members |

### Per-Channel Permission Overrides

Channels can override role permissions for fine-grained access control.

**Override States:**

- **Allow (1):** Explicitly grant permission (overrides role deny)
- **Deny (0):** Explicitly revoke permission (overrides role allow)
- **Inherit (null):** Use the role's base permission

### Default Role Templates

**Facilitator Role (suggested defaults):**
```
MANAGE_CHANNELS, KICK_MEMBERS, INVITE_MEMBERS, VIEW_CHANNELS, 
SEND_MESSAGES, SEND_IN_ANNOUNCEMENTS, ATTACH_FILES, 
MENTION_EVERYONE, MANAGE_MESSAGES, TIMEOUT_MEMBERS
```

**Student Role (suggested defaults):**
```
VIEW_CHANNELS, SEND_MESSAGES, ATTACH_FILES, 
READ_MESSAGE_HISTORY, CHANGE_NICKNAME
```

**@everyone (base defaults):**
```
VIEW_CHANNELS, SEND_MESSAGES, READ_MESSAGE_HISTORY
```

---

## 5. Core Features (MVP)

### 5.1 Authentication

- Google OAuth 2.0
- Facebook OAuth
- No email/password registration (simplifies onboarding)
- JWT access tokens (15-minute expiry)
- Refresh tokens (30-day expiry, stored in secure storage)
- Auto-join Default Program on signup

### 5.2 Programs

- Top-level organizational unit (like Discord servers)
- Name, description, logo/icon
- Status: Active, Completed, Archived
- Custom roles and permissions
- Invite codes (unique, can be regenerated)

### 5.3 Default Program

- **Name:** "Educational Research Group" (renameable by Super Admin)
- **Auto-join:** All new users automatically join on signup
- **Cannot leave or delete**
- **Default channels:** #welcome, #announcements, #general, #resources, #opportunities, #help

### 5.4 Categories

- Folders that organize channels into logical groups
- Collapsible in the UI
- Drag-and-drop reordering
- Permission overrides cascade to child channels

### 5.5 Channels

**Types:**
- **Text:** Standard messaging channel
- **Announcement:** Only designated roles can post

**Features:**
- Topic/description
- Pinned messages
- Mute notifications
- Unread indicator and mention badges

### 5.6 Direct Messages

- 1:1 conversations
- Group DMs (up to 8 participants)
- Online/offline status indicators
- Typing indicators

### 5.7 Messaging

- Markdown support (bold, italic, code, links)
- File attachments (up to 25MB)
- @mentions (@user, @role, @everyone, @here)
- Link previews
- Edit/delete messages

### 5.8 Message Search

- Search within a specific channel
- Search within a specific DM conversation
- Keyword-based search with results preview
- Jump to message in context

### 5.9 Invite System

- **Invite Code:** Shareable code (e.g., `ABC123XY`)
- **Invite Link:** URL that auto-joins program
- **Invite by Email:** Send invites directly to email addresses

### 5.10 Report Message

- Long-press message → "Report Message"
- Select reason: Harassment, Spam, Inappropriate, Off-topic, Other
- Reports go to users with `MANAGE_MESSAGES` permission
- Facilitators can view Reports List and take action

### 5.11 Notifications

- Push notifications (FCM + APNs)
- DM notifications
- @mention notifications (user, role, everyone)
- Per-channel/conversation mute toggle

### 5.12 File Sharing

- Images: JPG, PNG, GIF, WEBP
- Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX
- 25MB per file limit
- 5GB storage quota per program

### 5.13 Member Directory

- Searchable list of all members
- Filter by role
- View member profile
- Quick action to start DM

---

## 6. Data Models

### Core Entities

- **User:** id, email, displayName, avatarUrl, authProvider, isSuperAdmin
- **Program:** id, name, description, iconUrl, inviteCode, ownerId, isDefault
- **Role:** id, programId, name, color, position, permissions, isHoisted, isMentionable
- **ProgramMembership:** id, userId, programId, nickname
- **MemberRole:** id, membershipId, roleId
- **Category:** id, programId, name, position
- **Channel:** id, programId, categoryId, name, topic, type, position
- **PermissionOverride:** id, channelId, categoryId, roleId, userId, allow, deny
- **Message:** id, authorId, channelId, conversationId, content, mentionedUsers, mentionedRoles
- **Attachment:** id, messageId, fileName, fileUrl, mimeType, fileSize
- **Conversation:** id, isGroup
- **ConversationParticipant:** id, userId, conversationId, isMuted
- **Invite:** id, programId, invitedById, email, token, status, expiresAt
- **Report:** id, messageId, reporterId, programId, reason, notes, status

---

## 7. API Endpoints (Summary)

### Authentication
- `POST /api/auth/google` - Google OAuth
- `POST /api/auth/facebook` - Facebook OAuth
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### Programs
- `GET/POST /api/programs` - List/Create programs
- `GET/PATCH/DELETE /api/programs/:id` - Program CRUD
- `POST /api/programs/join` - Join via invite

### Invites
- `POST /api/programs/:id/invites/email` - Send email invites
- `GET /api/invites/:token` - Validate invite token
- `POST /api/invites/:token/accept` - Accept invite

### Members
- `GET /api/programs/:id/members` - List members
- `POST /api/programs/:id/members/:userId/roles/:roleId` - Assign role
- `POST /api/programs/:id/members/:userId/timeout` - Timeout member

### Roles
- `GET/POST /api/programs/:id/roles` - List/Create roles
- `GET/PATCH/DELETE /api/programs/:id/roles/:roleId` - Role CRUD

### Channels & Categories
- `GET/POST /api/programs/:id/categories` - Categories
- `GET/POST /api/programs/:programId/channels` - Channels
- `PUT /api/channels/:id/permissions/:targetId` - Permission overrides

### Messages
- `GET/POST /api/channels/:id/messages` - Messages
- `PATCH/DELETE /api/messages/:id` - Edit/Delete
- `POST /api/messages/:id/report` - Report message

### Search
- `GET /api/channels/:id/search?q=keyword` - Search in channel
- `GET /api/conversations/:id/search?q=keyword` - Search in DM

### Reports
- `GET /api/programs/:id/reports` - List reports
- `PATCH /api/programs/:id/reports/:reportId` - Update report status

---

## 8. Development Phases

### Phase 1: Backend Foundation
- Monorepo setup
- Prisma schema
- Auth endpoints (OAuth placeholder)
- Seed script for Default Program

### Phase 2: Roles System
- Role CRUD API
- Permission bitfield implementation
- Permission middleware

### Phase 3: Programs, Categories, Channels
- Programs CRUD with invite codes
- Invite-by-email with email service
- Categories and channels
- Real-time messaging (Socket.io)

### Phase 4: Direct Messages and Search
- Conversations API
- Presence status
- Message search

### Phase 5: Files, Notifications, Moderation
- File uploads (S3/Cloudinary)
- Push notifications
- Report message feature

### Phase 6: Polish and Launch
- UI/UX refinement (blue/gold theme)
- Testing
- iOS App Store submission

---

## 9. Future Enhancements (Post-MVP)

| Feature | Priority |
|---------|----------|
| User Settings (comprehensive) | High |
| Threaded replies | High |
| Emoji reactions | High |
| Global search | High |
| Announcement acknowledgment | High |
| Forum channels | Medium |
| Audit log UI | Medium |
| AutoMod | Medium |
| Files tab | Medium |
| Offline support | Medium |
| Voice messages | Medium |
| Web client | Medium |
| Program catalog | Low |
| Integrations | Low |
| Analytics dashboard | Low |

---

## 10. Security Considerations

- JWT tokens in secure storage (Keychain/Keystore)
- Permission checking middleware on all routes
- Row-level security in PostgreSQL
- HTTPS only (TLS 1.3)
- Input sanitization (XSS prevention)
- GDPR-compliant data handling
