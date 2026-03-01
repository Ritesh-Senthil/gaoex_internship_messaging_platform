# InternHub — Feature Guide

A complete guide to every feature in the InternHub app, organized by user flow. This document explains what each feature does, how to use it, and any important details.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Programs](#2-programs)
3. [Channels](#3-channels)
4. [Messaging](#4-messaging)
5. [Threads](#5-threads)
6. [Reactions](#6-reactions)
7. [File Sharing](#7-file-sharing)
8. [Message Pinning](#8-message-pinning)
9. [Direct Messages](#9-direct-messages)
10. [Group DMs](#10-group-dms)
11. [Search](#11-search)
12. [Roles & Permissions](#12-roles--permissions)
13. [User Profile](#13-user-profile)
14. [Presence & Typing](#14-presence--typing)
15. [Notifications](#15-notifications)
16. [Unread Tracking](#16-unread-tracking)

---

## 1. Authentication

### How Sign-In Works

InternHub uses **Google Sign-In** as the sole authentication method.

**Flow:**

1. Tap **Continue with Google** on the login screen
2. A native Google Sign-In sheet appears — choose your Google account
3. The app sends your Google credentials to Firebase for verification
4. Firebase returns an ID token, which the backend verifies
5. The backend creates (or finds) your user account and issues a JWT access token (15 min) and refresh token (30 days)
6. Tokens are stored securely on-device using Expo SecureStore

**Auto-refresh:** When your access token expires, the app silently refreshes it using the refresh token. If the refresh token is also expired, you're logged out automatically.

**First sign-in:** On your first sign-in, the app automatically:

- Creates your account using your Google name and profile photo
- Adds you to the Default Program
- Assigns you the `@everyone` role

### Logging Out

1. Go to the **Profile** tab (bottom-right)
2. Tap **Logout** (at the bottom of the screen)
3. Your tokens are cleared and you're returned to the login screen

---

## 2. Programs

Programs are the top-level organizational units (similar to Discord servers or Slack workspaces). Each program has its own channels, members, roles, and settings.

### Viewing Your Programs

The **Programs** tab (bottom-left) shows a grid of all programs you belong to. Each card displays the program name and its first letter as an icon.

- **Pull down** to refresh the list

### Creating a Program

1. Tap the **+** button (bottom-right corner) on the Programs screen
2. Select **Create Program**
3. **Step 1 — Name:** Enter a program name (minimum 3 characters)
4. **Step 2 — Description:** Optionally add a description
5. **Step 3 — Visibility:** Choose Public (anyone with invite code can join) or Private (join requests require approval)
6. Tap **Create Program**

You become the Owner of the program automatically. Default roles (@everyone) and a #general channel are created.

### Joining a Program

1. Tap the **+** button on the Programs screen
2. Select **Join with Invite Code**
3. Enter the invite code (ask the program owner for this)
4. Tap **Join Program**

For private programs, your request goes to a pending queue — an admin must approve it.

### Program Detail Screen

Tap a program card to open it. You'll see:

- **Hero section** — Program name, description, member count
- **Action strip** — Quick access to Members, Roles, Settings, and Share invite
- **Channels** — Organized under collapsible categories

Tap any channel to open it.

### Program Settings (Owner/Admin only)

1. From the Program Detail screen, tap the **Settings** gear icon
2. Available actions:
  - **Edit Info** — Change name, description
  - **Manage Channels** — Create/edit/delete channels and categories
  - **Invite Code** — View, share (via native share sheet), or regenerate
  - **Join Requests** (private programs) — Approve or reject pending requests
  - **Archive/Restore** — Temporarily disable the program
  - **Delete** — Permanently delete (requires confirmation)

### Sharing the Invite Code

1. From Program Detail, tap the **Share** button in the action strip
2. The native share sheet opens with a pre-formatted invite message containing the code
3. Send it via any app (Messages, WhatsApp, email, etc.)

---

## 3. Channels

Channels are where conversations happen within a program. There are two types:

- **Text Channels** — Anyone with the `SEND_MESSAGES` permission can post
- **Announcement Channels** — Only users with `SEND_IN_ANNOUNCEMENTS` permission can post; others can only read

### Browsing Channels

On the Program Detail screen, channels are listed under their categories. Each channel shows:

- A `#` icon (text) or megaphone icon (announcement)
- The channel name
- A blue dot if there are unread messages
- A muted icon if you've muted it

### Channel Management (Admin only)

1. From Program Settings, tap **Manage Channels**
2. You can:
  - **Create a category** — Tap the "New Category" button
  - **Create a channel** — Tap "New Channel" under any category or uncategorized
  - **Edit a channel** — Long-press or tap the overflow menu → Edit
  - **Delete a channel** — Long-press or tap the overflow menu → Delete
  - **Set channel type** — Text or Announcement
  - **Set a topic** — Optional description shown in the channel header
  - **Make private** — Restricts access (see Permissions below)
  - **Move to category** — Organize channels under different categories

### Private Channels & Permissions

1. When creating or editing a channel, toggle **Private** on
2. To manage who can access a private channel:
  - From Channel Management, tap the overflow menu on a private channel → **Manage Access**
  - Toggle specific roles and/or individual members on/off
3. Owners and admins (tier 0-1) always have access to private channels

### Muting a Channel

In the channel header, tap the **bell** icon to mute/unmute. Muted channels:

- Don't trigger push notifications
- Still show a blue dot for unread messages, but dimmed
- Show a muted icon in the channel list

---

## 4. Messaging

### Sending Messages

1. Open any channel or DM
2. Type in the message input at the bottom
3. Tap the **send** button (arrow icon)

Messages support **markdown formatting**:


| Syntax              | Result            |
| ------------------- | ----------------- |
| `**bold`**          | **bold**          |
| `*italic`*          | *italic*          |
| ``code``            | `code`            |
| `~~strikethrough~~` | ~~strikethrough~~ |
| ````code block````  | Code block        |


### @Mentions

Type `@` followed by a name to trigger the mention autocomplete:

- Select a user to mention them (they receive a notification)
- Select a role to mention all members with that role
- Type `@everyone` to mention all channel members (requires `MENTION_EVERYONE` permission)

Mentioned users see the message highlighted and receive a push notification even if the channel is muted.

### Editing a Message

1. **Long-press** your own message
2. Tap **Edit**
3. The message input becomes an edit field with the original text
4. Make changes and tap the **save** button (checkmark)
5. Edited messages show an "(edited)" indicator

### Deleting a Message

1. **Long-press** a message
2. Tap **Delete**
3. Confirm the deletion

You can delete your own messages. Users with `MANAGE_MESSAGES` permission can delete anyone's messages.

### Message Drafts

If you start typing a message but navigate away, your draft is automatically saved. When you return to the same channel/DM/thread, the draft is restored. Drafts are saved locally on-device and cleared when you send.

---

## 5. Threads

Threads let you have focused conversations branching off a specific message.

### Starting a Thread

Two ways:

1. **Swipe right** on a message → the reply input appears
2. **Long-press** a message → tap **Reply in Thread**

### Viewing a Thread

Below messages that have replies, a **thread indicator** appears showing:

- Reply count
- Avatars of recent repliers
- Time of last reply

Tap the indicator to open the **Thread screen**, which shows the original message and all replies.

### Thread Behavior

- Thread replies are separate from the main channel — they don't clutter the channel feed
- New thread replies are delivered in real-time
- Thread reply counts update in real-time on the parent message

---

## 6. Reactions

### Adding a Reaction

1. **Long-press** a message
2. The action sheet shows a row of **quick-react emojis** at the top (commonly used emojis)
3. Tap an emoji to add it instantly

### Toggling Reactions

- Tap an existing reaction emoji below a message to toggle your reaction on/off
- The reaction badge shows the count and highlights if you've reacted

### Common Emojis

The quick-react bar shows the most commonly used emojis. These are fetched from the server and represent popular reactions across the platform.

---

## 7. File Sharing

### Uploading Files

1. Tap the **attachment** (paperclip) icon in the message input
2. Choose from:
  - **Photo Library** — Select images or videos
  - **Take Photo** — Use the camera
  - **Document** — Select any file type
3. Selected files appear as a preview above the input
4. Optionally add a text message alongside the files
5. Tap **send**

### Supported File Types


| Category  | Types                               |
| --------- | ----------------------------------- |
| Images    | JPEG, PNG, GIF, WebP, HEIC          |
| Videos    | MP4, MOV, AVI                       |
| Documents | PDF, DOC, DOCX, XLS, XLSX, PPT, TXT |
| Audio     | MP3, WAV, M4A                       |


### Viewing Attachments

- **Images** — Displayed inline in the message
- **Other files** — Shown as a file card with name, size, and type icon
- Tap any attachment to open/download it

### Deleting Attachments

The message author can delete attachments by deleting the entire message.

---

## 8. Message Pinning

Pin important messages so they're easy to find later.

### Pinning a Message

1. **Long-press** a message
2. Tap **Pin Message**
3. The message is pinned and a real-time notification appears for all channel/DM members

Requires either being the message author or having `MANAGE_MESSAGES` permission.

### Viewing Pinned Messages

1. Tap the **pin** icon in the channel/DM header
2. The Pinned Messages screen shows all pinned messages
3. Tap any pinned message to scroll to it in context (with highlight animation)

### Unpinning a Message

On the Pinned Messages screen, tap the **unpin** icon next to a message.

---

## 9. Direct Messages

### Starting a 1:1 DM

1. Go to the **Messages** tab (bottom navigation)
2. Tap the **new message** icon (top-right or FAB)
3. Search for a user by name or email
4. Select them and tap **Start Conversation**

Or from any member profile, tap **Send Message**.

### DM Features

DMs support all the same features as channels:

- Text messages with markdown
- @Mentions
- Reactions
- Thread replies
- File attachments
- Message pinning
- Message editing and deletion

### DM-Specific Features

- **Typing indicators** — See animated dots with the other person's name/avatar when they're typing
- **Mute** — Tap the bell icon in the header to mute notifications
- **Unread badges** — Blue dot on the conversation list for unread messages

---

## 10. Group DMs

### Creating a Group DM

1. Go to **Messages** tab → tap **new message**
2. Select **2 or more** users
3. Optionally enter a **group name**
4. Tap **Create Group**

Groups support up to **8 participants**.

### Group Management

Tap the group name in the header to open **Group Info**:

- **Rename group** — Tap the group name to edit it
- **Add members** — Tap "Add Members", search for users, and add them
- **Mute** — Toggle notifications for this group
- **Leave group** — Exit the group (you can be re-added by other members)
- **Member list** — See all participants with their online status; tap to view profile

### Group Behavior

- When someone adds a member, all participants are notified in real-time
- When someone leaves, the participant list updates in real-time
- If only 1 participant remains, the group conversation still exists in their list

---

## 11. Search

### Accessing Search

Tap the **Search** tab (bottom navigation, magnifying glass icon).

### How to Search

1. Tap the search bar and type your query
2. Results appear automatically after a brief debounce delay
3. Results are categorized into tabs:
  - **All** — Combined results
  - **Channels** — Matching channel names
  - **People** — Matching user names/emails
  - **DMs** — Messages from direct conversations

### Search Results

**Messages** — Shows:

- The matched text with your query highlighted
- Author name and avatar
- Channel or conversation context
- Timestamp

**Channels** — Shows:

- Channel name and program
- Channel type (text/announcement)

**People** — Shows:

- User name and avatar
- Email address

### Navigating from Search

- Tap a **message result** → opens the channel/DM scrolled to that message with a highlight animation
- Tap a **channel result** → opens the program detail, then channel
- Tap a **person result** → opens their member profile (if you share a program)

### Pagination

Scroll to the bottom of message results and tap "Load more" if available.

---

## 12. Roles & Permissions

### Role Tiers

InternHub uses a 4-tier role hierarchy:


| Tier  | Level     | Description                       |
| ----- | --------- | --------------------------------- |
| **0** | Owner     | Full control, created the program |
| **1** | Admin     | Administrative privileges         |
| **2** | Moderator | Content moderation                |
| **3** | Member    | Standard permissions              |


Lower tier = more authority. A tier-1 admin cannot modify a tier-0 owner's roles.

### Viewing Roles

1. From Program Detail, tap **Roles** in the action strip
2. Roles are grouped by tier with color-coded headers

### Creating a Role

1. From the Roles list, tap the **+** button
2. Configure:
  - **Name** — Role display name
  - **Color** — Pick from the color palette
  - **Tier** — Owner, Admin, Moderator, or Member
  - **Display separately** (hoisted) — Show members with this role in a separate group in the member directory
  - **Mentionable** — Allow @role mentions
  - **Permissions** — Toggle individual permissions (see below)
3. Tap **Create Role**

### Permission List


| Permission              | Description                                  |
| ----------------------- | -------------------------------------------- |
| `ADMINISTRATOR`         | Full access, bypasses all permission checks  |
| `MANAGE_PROGRAM`        | Edit program settings                        |
| `MANAGE_ROLES`          | Create, edit, delete roles and assign them   |
| `MANAGE_CHANNELS`       | Create, edit, delete channels and categories |
| `KICK_MEMBERS`          | Remove members from the program              |
| `BAN_MEMBERS`           | Ban members from the program                 |
| `INVITE_MEMBERS`        | Generate and share invite codes              |
| `CHANGE_NICKNAME`       | Change own nickname                          |
| `MANAGE_NICKNAMES`      | Change other members' nicknames              |
| `SEND_MESSAGES`         | Send messages in text channels               |
| `SEND_IN_ANNOUNCEMENTS` | Send messages in announcement channels       |
| `CREATE_THREADS`        | Create thread replies                        |
| `ATTACH_FILES`          | Upload files and media                       |
| `MENTION_EVERYONE`      | Use @everyone mention                        |
| `ADD_REACTIONS`         | Add emoji reactions                          |
| `MANAGE_MESSAGES`       | Delete others' messages, pin/unpin           |
| `VIEW_AUDIT_LOG`        | View the program audit log                   |
| `MUTE_MEMBERS`          | Server-mute members                          |
| `DEAFEN_MEMBERS`        | Server-deafen members                        |
| `MOVE_MEMBERS`          | Move members between voice channels          |


### Assigning Roles to Members

1. Open a member's profile (from Member Directory or by tapping their avatar)
2. Tap **Manage Roles**
3. Toggle roles on/off
4. Tap **Done**

Role changes take effect immediately and are broadcast in real-time.

### The @everyone Role

Every program has a default `@everyone` role that all members automatically have. It defines the baseline permissions for the program. It cannot be deleted.

---

## 13. User Profile

### Viewing Your Profile

Tap the **Profile** tab (bottom-right, shows your avatar).

Your profile card shows:

- **Banner** — A colored banner (customizable)
- **Avatar** — Your profile photo or initial
- **Display name**
- **Bio** — A short bio with markdown support (up to ~280 characters)
- **Custom status** — Emoji + text (optional)
- **Account info** — Email, sign-in provider, member since date, app version

### Editing Your Profile

1. Tap **Edit Profile** on the profile screen
2. You can change:
  - **Display Name**
  - **Bio** — Supports markdown (bold, italic, code)
  - **Banner Color** — Pick from a preset palette

### Changing Your Avatar

1. Tap your avatar on the profile screen
2. Choose **Take Photo** or **Choose from Library**
3. Your avatar updates immediately across the app

To remove your avatar and revert to the initial-based fallback, use the same flow and there's an option to remove.

### Custom Status

1. Tap **Set Status** (or **Edit Status** if one is set) on the profile screen
2. Choose an **emoji** (tap the emoji icon to browse)
3. Enter **status text** (e.g., "In a meeting")
4. Set **expiration**: 1 hour, 4 hours, Today, or Don't clear
5. Tap **Save**

Your status appears next to your name in member lists and profiles. It automatically clears when the timer expires.

### Viewing Other Members' Profiles

Tap a user's avatar in any message, member directory, or search result to view their profile. Their profile card shows:

- Banner, avatar, display name, bio, status
- Their roles in the shared program (with colored badges)
- **Send Message** button to start a DM
- **Manage Roles** button (if you have permission)

---

## 14. Presence & Typing

### Online/Offline Status

- A **green dot** on a user's avatar means they're online
- No dot means they're offline
- Status updates in real-time across all screens

The app marks you as online when connected and offline when disconnected (with a 5-second grace period to handle brief disconnections).

### Typing Indicators

In DMs and group DMs, when someone is typing:

- An animated **"..."** indicator appears at the bottom of the chat
- It shows the person's name and avatar
- For groups, it shows up to 2 names, then "and X others are typing"
- The indicator auto-clears after 3 seconds of inactivity

### Connection Status

A banner appears at the top of chat screens when the connection is lost, showing:

- **"Connecting..."** when trying to reconnect
- **"Connected"** briefly when reconnected
- The app automatically reconnects and re-joins all rooms

---

## 15. Notifications

### Push Notifications

InternHub sends push notifications for:

- **New messages** in channels you belong to (unless muted)
- **@Mentions** (even in muted channels)
- **New DMs**
- **Thread replies** to threads you've participated in

### Notification Behavior

- Notifications are delivered via **Expo Push Notifications**
- Tapping a notification deep-links to the relevant channel/DM/thread
- You won't receive notifications for your own messages
- Muted channels suppress message notifications but not @mentions

### Managing Notifications

- **Mute a channel** — Tap the bell icon in the channel header
- **Mute a DM** — Tap the bell icon in the DM header or Group Info screen
- System-level notification settings can be managed in iOS Settings → InternHub

---

## 16. Unread Tracking

### Channel Unreads

- Channels with unread messages show a **blue dot** in the channel list
- Opening a channel marks it as read
- The app tracks your last-read position per channel

### DM Unreads

- Conversations with unread messages show a **blue dot** and preview of the last message
- Opening a conversation marks it as read

### Mention Badges

- If you're @mentioned, the channel/DM shows a **red badge** with the mention count
- These badges appear on the program card and channel list

### Real-Time Updates

All unread tracking updates in real-time:

- When someone sends a message in a channel you're not currently viewing, you see the blue dot immediately
- When you open a channel, the unread indicator clears for other connected devices

