# InternHub

A mobile-first team collaboration platform (Discord/Slack-style) built for internship programs. Facilitators and students communicate, share resources, and collaborate within programs that have channels, roles, and direct messages.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile** | React Native (Expo SDK 54), TypeScript |
| **Backend** | Node.js, Express, Socket.io, TypeScript |
| **Database** | PostgreSQL (Supabase-hosted) |
| **ORM** | Prisma |
| **File Storage** | Supabase Storage |
| **Auth** | Google Sign-In → Firebase Auth → Backend JWT |
| **State** | Zustand (mobile) |
| **Push** | Expo Push Notifications |

## Monorepo Structure

```
internhub/
├── backend/          # Express API + Socket.io server
│   ├── prisma/       # Schema, migrations, seed
│   └── src/          # Routes, middleware, config, utils
├── mobile/           # React Native (Expo) app
│   └── src/          # Screens, components, services, stores
└── docs/             # Documentation
    ├── SETUP.md          # Local dev setup (step-by-step)
    ├── FEATURES.md       # Complete feature guide
    ├── ARCHITECTURE.md   # Tech deep-dive
    ├── API.md            # REST + Socket.io reference
    ├── CHECKPOINT.md     # Dev progress log
    └── SPECIFICATION.md  # Original spec
```

## Quick Start

> Full step-by-step instructions: **[docs/SETUP.md](docs/SETUP.md)**

### Prerequisites

- Node.js 18+
- npm or yarn
- Xcode 15+ (for iOS simulator)
- A Supabase project (free tier works)
- A Firebase project (free tier works)

### 1. Clone and install

```bash
git clone <repo-url> && cd internhub

# Backend
cd backend && npm install

# Mobile
cd ../mobile && npm install
```

### 2. Configure environment

```bash
# Copy the example and fill in your credentials
cp backend/.env.example backend/.env
```

You need: Supabase DB URL, Supabase service key, Firebase service account credentials, and two JWT secrets. See [docs/SETUP.md](docs/SETUP.md) for where to find each value.

### 3. Set up database

```bash
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

### 4. Start the backend

```bash
cd backend
npm run dev
# Server runs on http://localhost:3000
```

### 5. Start the mobile app

```bash
cd mobile
npx expo run:ios
```

> **Note:** Google Sign-In requires a native dev build (`expo run:ios`), not Expo Go.

### 6. Sign in

Open the app on the iOS simulator, tap "Continue with Google", and sign in. You'll automatically join the default program.

## Key Features

- **Programs** — Create or join collaboration spaces with invite codes
- **Channels** — Text and announcement channels organized by categories
- **Direct Messages** — 1:1 and group DMs (up to 8 participants)
- **Real-time Messaging** — Instant delivery via Socket.io
- **Threads** — Reply to any message in a thread
- **Reactions** — Emoji reactions on any message
- **File Sharing** — Upload images, documents, and media
- **Roles & Permissions** — 4-tier role system with 20 granular permissions
- **Markdown** — Bold, italic, code, and strikethrough in messages
- **@Mentions** — Mention users and roles with autocomplete
- **Message Pinning** — Pin important messages per channel/DM
- **Search** — Global search across messages, channels, and people
- **Presence** — Online/offline indicators
- **Typing Indicators** — See who's typing in DMs
- **Unread Tracking** — Blue dots and mention badges
- **Push Notifications** — Expo Push for messages, mentions, and DMs
- **Rich Profiles** — Avatar, bio, banner color, custom status with auto-expiry

## Documentation

| Document | Description |
|----------|-------------|
| [SETUP.md](docs/SETUP.md) | Step-by-step local development setup |
| [FEATURES.md](docs/FEATURES.md) | Complete feature guide with usage instructions |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical architecture and design patterns |
| [API.md](docs/API.md) | REST endpoints and Socket.io events reference |

## License

Private — all rights reserved.
