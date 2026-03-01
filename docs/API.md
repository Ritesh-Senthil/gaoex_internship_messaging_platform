# InternHub — API Reference

Complete reference for all REST endpoints and Socket.io events.

**Base URL:** `http://localhost:3000` (development)
**API Prefix:** `/api`
**Auth:** JWT Bearer token in `Authorization` header (unless noted)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Programs](#2-programs)
3. [Categories & Channels (Program-scoped)](#3-categories--channels-program-scoped)
4. [Channels](#4-channels)
5. [Messages (Reactions)](#5-messages-reactions)
6. [Conversations (DMs)](#6-conversations-dms)
7. [Users](#7-users)
8. [Roles](#8-roles)
9. [Search](#9-search)
10. [Upload](#10-upload)
11. [Socket.io Events](#11-socketio-events)

---

## Common Response Format

All endpoints return:

```json
{
  "success": true,
  "data": { ... }
}
```

Or on error:

```json
{
  "success": false,
  "error": {
    "message": "Error description"
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 500 | Internal server error |

---

## 1. Authentication

### `POST /api/auth/firebase`

Authenticate with a Firebase ID token. Creates user account on first sign-in.

**Auth:** None

**Body:**
```json
{
  "idToken": "firebase-id-token-string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@gmail.com",
      "displayName": "John Doe",
      "avatarUrl": "https://...",
      "bio": null,
      "bannerColor": "#0A84FF",
      "statusEmoji": null,
      "statusText": null,
      "statusExpiresAt": null,
      "isSuperAdmin": false
    },
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "isNewUser": false
  }
}
```

---

### `POST /api/auth/refresh`

Refresh an expired access token.

**Auth:** None

**Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-jwt-access-token",
    "refreshToken": "new-jwt-refresh-token"
  }
}
```

---

### `POST /api/auth/logout`

Invalidate a refresh token and mark user offline.

**Auth:** None

**Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

---

### `POST /api/auth/logout-all`

Invalidate all refresh tokens for a user. Super admins can target other users.

**Auth:** JWT (Super Admin or Owner)

**Body:**
```json
{
  "userId": "optional-target-user-id"
}
```

---

## 2. Programs

### `GET /api/programs`

List all programs the authenticated user belongs to.

**Response:** Array of programs with `_count.memberships`.

---

### `GET /api/programs/default`

Get the default program.

---

### `POST /api/programs`

Create a new program.

**Body:**
```json
{
  "name": "Summer Internship",
  "description": "Optional description",
  "isPrivate": false
}
```

---

### `GET /api/programs/:id`

Get program details including categories, channels, and member count.

---

### `PATCH /api/programs/:id`

Update program info.

**Permission:** Owner or MANAGE_PROGRAM

**Body:** Any subset of `{ name, description, isPrivate }`

---

### `DELETE /api/programs/:id`

Delete a program and all its data.

**Permission:** Owner or MANAGE_PROGRAM

---

### `POST /api/programs/join`

Join a program with an invite code.

**Body:**
```json
{
  "inviteCode": "ABC123"
}
```

For private programs, creates a join request instead of immediately joining.

---

### `GET /api/programs/:id/members`

List all members with their roles and online status.

---

### `GET /api/programs/:id/members/:memberId`

Get a specific member's profile (by membership ID).

---

### `GET /api/programs/:id/members/by-user/:userId`

Get a specific member's profile (by user ID).

---

### `POST /api/programs/:id/invite/regenerate`

Generate a new invite code.

**Permission:** INVITE_MEMBERS

---

### `GET /api/programs/:id/invite-code`

Get the current invite code.

---

### `GET /api/programs/:id/join-requests`

List pending join requests (private programs).

**Permission:** INVITE_MEMBERS

---

### `POST /api/programs/:id/join-requests/:requestId/approve`

Approve a join request.

**Permission:** INVITE_MEMBERS

---

### `POST /api/programs/:id/join-requests/:requestId/reject`

Reject a join request.

**Permission:** INVITE_MEMBERS

---

### `POST /api/programs/:id/transfer-ownership`

Transfer program ownership to another member.

**Permission:** Owner only

**Body:**
```json
{
  "newOwnerId": "user-id"
}
```

---

### `PATCH /api/programs/:id/archive`

Archive a program (soft-delete).

**Permission:** Owner

---

### `PATCH /api/programs/:id/restore`

Restore an archived program.

**Permission:** Owner

---

## 3. Categories & Channels (Program-scoped)

### `POST /api/programs/:id/categories`

Create a category in a program.

**Permission:** MANAGE_CHANNELS

**Body:**
```json
{
  "name": "GENERAL",
  "position": 0
}
```

---

### `PATCH /api/programs/:id/categories/:categoryId`

Update a category.

**Permission:** MANAGE_CHANNELS

---

### `DELETE /api/programs/:id/categories/:categoryId`

Delete a category (channels become uncategorized).

**Permission:** MANAGE_CHANNELS

---

### `POST /api/programs/:id/channels`

Create a channel.

**Permission:** MANAGE_CHANNELS

**Body:**
```json
{
  "name": "general",
  "type": "TEXT",
  "categoryId": "optional-category-id",
  "topic": "Optional topic",
  "isPrivate": false
}
```

---

### `PATCH /api/programs/:id/channels/:channelId`

Update a channel.

**Permission:** MANAGE_CHANNELS

---

### `DELETE /api/programs/:id/channels/:channelId`

Delete a channel and all its messages.

**Permission:** MANAGE_CHANNELS

---

### `POST /api/programs/:id/channels/:channelId/move`

Move a channel to a different category.

**Permission:** MANAGE_CHANNELS

**Body:**
```json
{
  "categoryId": "target-category-id-or-null"
}
```

---

### `GET /api/programs/:id/channels/:channelId/permissions`

Get permission overrides for a channel.

**Permission:** MANAGE_CHANNELS

---

### `PUT /api/programs/:id/channels/:channelId/permissions`

Set permission overrides for a private channel.

**Permission:** MANAGE_CHANNELS

**Body:**
```json
{
  "roleOverrides": [{ "roleId": "...", "allow": true }],
  "memberOverrides": [{ "userId": "...", "allow": true }]
}
```

---

## 4. Channels

### `GET /api/channels/:id`

Get channel details.

---

### `GET /api/channels/:id/messages`

Get channel messages (paginated, newest first).

**Query params:**
- `before` — Cursor for pagination (message ID)
- `limit` — Number of messages (default: 50)

---

### `POST /api/channels/:id/messages`

Send a message in a channel.

**Permission:** SEND_MESSAGES (or SEND_IN_ANNOUNCEMENTS for announcement channels)

**Body:**
```json
{
  "content": "Hello world!",
  "parentMessageId": "optional-for-thread-reply",
  "mentionedUserIds": ["user-id-1"],
  "mentionedRoleIds": ["role-id-1"],
  "mentionEveryone": false
}
```

---

### `PATCH /api/channels/:channelId/messages/:messageId`

Edit a message.

**Permission:** Author or MANAGE_MESSAGES

**Body:**
```json
{
  "content": "Updated content"
}
```

---

### `DELETE /api/channels/:channelId/messages/:messageId`

Delete a message.

**Permission:** Author or MANAGE_MESSAGES

---

### `GET /api/channels/messages/:messageId/thread`

Get thread replies for a message.

**Query params:** `before`, `limit`

---

### `POST /api/channels/:id/read`

Mark channel as read (updates ChannelRead timestamp).

---

### `GET /api/channels/:id/unread`

Get unread status (count and has-unread boolean).

---

### `POST /api/channels/:id/mute`

Toggle mute for a channel.

---

### `GET /api/channels/:id/mute`

Get mute status.

**Response:**
```json
{
  "success": true,
  "data": { "isMuted": true }
}
```

---

### `POST /api/channels/:channelId/messages/:messageId/pin`

Pin a message.

**Permission:** Author or MANAGE_MESSAGES

---

### `DELETE /api/channels/:channelId/messages/:messageId/pin`

Unpin a message.

---

### `GET /api/channels/:channelId/pinned`

Get all pinned messages in a channel.

---

## 5. Messages (Reactions)

### `GET /api/messages/:messageId/reactions`

Get all reactions on a message.

---

### `POST /api/messages/:messageId/reactions`

Add a reaction.

**Body:**
```json
{
  "emoji": "👍"
}
```

---

### `DELETE /api/messages/:messageId/reactions/:emoji`

Remove your reaction (URL-encode the emoji).

---

### `GET /api/messages/common`

Get the list of commonly-used reaction emojis.

**Response:**
```json
{
  "success": true,
  "data": {
    "emojis": ["👍", "❤️", "😂", "🎉", "😮", "😢"]
  }
}
```

---

## 6. Conversations (DMs)

### `GET /api/conversations`

List all conversations for the authenticated user.

---

### `POST /api/conversations`

Create a 1:1 or group conversation.

**Body:**
```json
{
  "participantIds": ["user-id-1", "user-id-2"],
  "isGroup": false,
  "groupName": "Optional group name"
}
```

For 1:1 conversations, if one already exists, it's returned instead of creating a duplicate.

---

### `GET /api/conversations/:id`

Get conversation details with participants.

---

### `PATCH /api/conversations/:id`

Rename a group conversation.

**Body:**
```json
{
  "groupName": "New Group Name"
}
```

---

### `DELETE /api/conversations/:id`

Leave a conversation (or delete if 1:1).

---

### `GET /api/conversations/:id/messages`

Get DM messages (paginated).

**Query params:** `before`, `limit`

---

### `POST /api/conversations/:id/messages`

Send a DM message.

**Body:**
```json
{
  "content": "Hey!",
  "parentMessageId": "optional-for-thread-reply"
}
```

---

### `PATCH /api/conversations/:id/messages/:messageId`

Edit a DM message (author only).

---

### `DELETE /api/conversations/:id/messages/:messageId`

Delete a DM message (author only).

---

### `GET /api/conversations/:id/messages/:messageId/thread`

Get DM thread replies.

---

### `POST /api/conversations/:id/read`

Mark conversation as read.

---

### `POST /api/conversations/:id/mute`

Toggle mute.

---

### `GET /api/conversations/:id/mute`

Get mute status.

---

### `POST /api/conversations/:id/participants`

Add participants to a group conversation.

**Body:**
```json
{
  "userIds": ["user-id-1", "user-id-2"]
}
```

---

### `POST /api/conversations/:id/messages/:messageId/pin`

Pin a DM message.

---

### `DELETE /api/conversations/:id/messages/:messageId/pin`

Unpin a DM message.

---

### `GET /api/conversations/:id/pinned`

Get pinned messages in a conversation.

---

## 7. Users

### `GET /api/users/me`

Get the authenticated user's profile.

---

### `PATCH /api/users/me`

Update profile fields.

**Body:** Any subset of:
```json
{
  "displayName": "New Name",
  "bio": "About me...",
  "bannerColor": "#FF5722",
  "statusEmoji": "🏖️",
  "statusText": "On vacation",
  "statusExpiresAt": "2026-03-15T12:00:00Z"
}
```

Set status fields to `null` to clear the custom status.

---

### `POST /api/users/me/avatar`

Upload a new avatar image.

**Content-Type:** `multipart/form-data`
**Field:** `avatar` (image file)

---

### `DELETE /api/users/me/avatar`

Remove avatar (revert to initial-based fallback).

---

### `GET /api/users/search`

Search users by name or email.

**Query params:**
- `q` — Search query
- `limit` — Max results (default: 20)

---

### `GET /api/users/:userId/shared-program`

Get the first program shared between the authenticated user and the target user.

---

### `POST /api/users/push-token`

Register an Expo push notification token.

**Body:**
```json
{
  "token": "ExponentPushToken[...]"
}
```

---

### `DELETE /api/users/push-token`

Remove the push token (on logout).

---

### `GET /api/users/:id`

Get a user's public profile by ID.

---

## 8. Roles

All role endpoints are scoped under `/api/programs/:programId/roles`.

### `GET /api/programs/:programId/roles`

List all roles in a program.

---

### `GET /api/programs/:programId/roles/:roleId`

Get a specific role with its permissions and member count.

---

### `POST /api/programs/:programId/roles`

Create a new role.

**Permission:** MANAGE_ROLES

**Body:**
```json
{
  "name": "Mentor",
  "color": "#3498DB",
  "tier": 2,
  "permissions": "512",
  "isHoisted": true,
  "isMentionable": true
}
```

`permissions` is a BigInt string representation of the bitfield.

---

### `PATCH /api/programs/:programId/roles/:roleId`

Update a role.

**Permission:** MANAGE_ROLES (and your tier must be lower than the role's tier)

---

### `DELETE /api/programs/:programId/roles/:roleId`

Delete a role (cannot delete @everyone).

**Permission:** MANAGE_ROLES

---

### `POST /api/programs/:programId/members/:memberId/roles`

Assign a role to a member.

**Permission:** MANAGE_ROLES

**Body:**
```json
{
  "roleId": "role-id"
}
```

---

### `DELETE /api/programs/:programId/members/:memberId/roles/:roleId`

Remove a role from a member.

**Permission:** MANAGE_ROLES

---

### `GET /api/programs/permissions`

Get the list of all permission definitions with descriptions.

---

### `GET /api/programs/tiers`

Get the list of role tier definitions.

---

## 9. Search

### `GET /api/search/messages`

Search messages across channels and DMs.

**Query params:**
- `q` — Search query (required)
- `programId` — Scope to a specific program
- `scope` — `channels`, `dms`, or `all` (default: `all`)
- `before` — Pagination cursor (message ID)
- `limit` — Max results (default: 20)

---

### `GET /api/search/channels`

Search channels by name.

**Query params:**
- `q` — Search query (required)
- `programId` — Scope to a specific program

---

## 10. Upload

### `POST /api/upload/channel/:channelId`

Upload files to a channel message.

**Permission:** ATTACH_FILES

**Content-Type:** `multipart/form-data`
**Fields:**
- `files` — One or more files (max 5, max 10MB each)
- `content` — Optional message text
- `parentMessageId` — Optional thread parent ID

---

### `POST /api/upload/conversation/:conversationId`

Upload files to a DM message.

**Content-Type:** `multipart/form-data`
**Fields:**
- `files` — One or more files
- `content` — Optional message text
- `parentMessageId` — Optional thread parent ID

---

### `DELETE /api/upload/:attachmentId`

Delete an attachment (author only).

---

## 11. Socket.io Events

### Connection

Connect to the Socket.io server at the base URL (e.g., `http://localhost:3000`).

```javascript
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
});
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `authenticate` | `token: string` | Send JWT access token to verify identity, join personal room, mark online |
| `join_program` | `programId: string` | Join the program room for channel/member/role events |
| `leave_program` | `programId: string` | Leave the program room |
| `join_channel` | `channelId: string` | Join a channel room for message events |
| `leave_channel` | `channelId: string` | Leave a channel room |
| `join_conversation` | `conversationId: string` | Join a DM room for message events |
| `leave_conversation` | `conversationId: string` | Leave a DM room |
| `typing_start` | `{ channelId?, conversationId?, userId }` | Signal that the user is typing |
| `typing_stop` | `{ channelId?, conversationId?, userId }` | Signal that the user stopped typing |

### Server → Client Events

#### Presence

| Event | Payload | Rooms |
|-------|---------|-------|
| `user:online` | `{ userId, displayName }` | `program:*`, `user:*` |
| `user:offline` | `{ userId }` | `program:*`, `user:*` |
| `user:profile_updated` | `{ userId, displayName?, avatarUrl?, bio?, bannerColor?, statusEmoji?, statusText?, statusExpiresAt? }` | `program:*`, `user:*` |

#### Typing

| Event | Payload | Rooms |
|-------|---------|-------|
| `user_typing` | `{ channelId, userId }` or `{ conversationId, userId, displayName, avatarUrl }` | `channel:*` or `conversation:*` |
| `user_stopped_typing` | Same as above | Same |

#### Channel Messages

| Event | Payload | Room |
|-------|---------|------|
| `new_message` | Full message object | `channel:{channelId}` |
| `message_updated` | Updated message object | `channel:{channelId}` |
| `message_deleted` | `{ messageId, channelId, parentMessageId? }` | `channel:{channelId}` |
| `message_pinned` | `{ channelId, message, pinnedBy }` | `channel:{channelId}` |
| `message_unpinned` | `{ channelId, messageId, unpinnedBy }` | `channel:{channelId}` |
| `thread:reply_added` | `{ parentMessageId, replyCount, lastReplyAt, latestReplyAuthors }` | `channel:{channelId}` |
| `reaction_added` | `{ messageId, channelId, emoji, user }` | `channel:{channelId}` |
| `reaction_removed` | `{ messageId, channelId, emoji, user }` | `channel:{channelId}` |

#### DM Messages

| Event | Payload | Room |
|-------|---------|------|
| `new_dm_message` | `{ conversationId, message }` | `conversation:{id}` |
| `dm_message_updated` | `{ conversationId, message }` | `conversation:{id}` |
| `dm_message_deleted` | `{ conversationId, messageId, parentMessageId? }` | `conversation:{id}` |
| `reaction_added` | `{ messageId, conversationId, emoji, user }` | `conversation:{id}` |
| `reaction_removed` | `{ messageId, conversationId, emoji, user }` | `conversation:{id}` |

#### Unread Tracking

| Event | Payload | Room |
|-------|---------|------|
| `unread:channel` | `{ channelId, programId, authorId, excludeSocketIds }` | `program:{programId}` |
| `unread:dm` | `{ conversationId, recipientUserId, senderId, excludeSocketIds }` | `user:{recipientUserId}` |
| `unread:mention` | `{ channelId, programId, mentionedUserIds, excludeSocketIds }` | `program:{programId}` |

#### Channel/Category Management

| Event | Payload | Room |
|-------|---------|------|
| `channel:created` | `{ programId, channel }` | `program:{programId}` |
| `channel:updated` | `{ programId, channel }` | `program:{programId}` |
| `channel:deleted` | `{ programId, channelId }` | `program:{programId}` |
| `channel:moved` | `{ programId, channelId, fromCategoryId, toCategoryId }` | `program:{programId}` |
| `category:created` | `{ programId, category }` | `program:{programId}` |
| `category:updated` | `{ programId, category }` | `program:{programId}` |
| `category:deleted` | `{ programId, categoryId }` | `program:{programId}` |

#### Member/Role Management

| Event | Payload | Room |
|-------|---------|------|
| `member:joined` | `{ programId, member }` | `program:{programId}` |
| `member:role_changed` | `{ programId, userId, roles }` | `program:{programId}` |
| `role:created` | `{ programId, role }` | `program:{programId}` |
| `role:updated` | `{ programId, role }` | `program:{programId}` |
| `role:deleted` | `{ programId, roleId }` | `program:{programId}` |

#### Program Events

| Event | Payload | Room |
|-------|---------|------|
| `program:updated` | `{ programId, name?, description?, iconUrl?, isPrivate? }` | `program:{programId}` |
| `program:deleted` | `{ programId }` | `program:{programId}` |

#### Group DM Events

| Event | Payload | Room |
|-------|---------|------|
| `group:created` | `{ conversation }` | `user:{participantId}` (each) |
| `group:updated` | `{ conversationId, name, displayName, updatedBy }` | `conversation:{id}`, `user:{participantId}` |
| `group:participant_added` | `{ conversationId, addedUsers, addedBy }` | `conversation:{id}`, `user:{addedUserId}` |
| `group:participant_left` | `{ conversationId, userId, displayName, remainingCount }` | `conversation:{id}`, `user:{participantId}` |

---

## Other Endpoints

### `GET /health`

Health check (no auth required).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-01T00:00:00.000Z",
  "environment": "development"
}
```

### `GET /api`

API info with version and list of available endpoint groups.
