# InternHub

A Discord-style mobile collaboration platform for internship programs.

## Overview

InternHub is a mobile-first team collaboration platform designed specifically for internship programs, enabling facilitators and students to communicate, share resources, and collaborate effectively.

## Features

- **Programs** - Create and manage internship programs (like Discord servers)
- **Custom Roles** - 20 granular permissions for fine-grained access control
- **Channels** - Text and announcement channels organized by categories
- **Direct Messages** - 1:1 and group conversations
- **Real-time Messaging** - Instant message delivery with Socket.io
- **@Mentions** - Mention users, roles, @everyone, @here
- **File Sharing** - Share images and documents (up to 25MB)
- **Message Search** - Find past conversations easily
- **Invite System** - Invite via code, link, or email
- **Report System** - Flag inappropriate content for moderators

## Tech Stack

### Mobile App
- React Native (iOS + Android)
- React Navigation v6
- Socket.io-client
- Firebase Cloud Messaging

### Backend
- Node.js + Express.js
- PostgreSQL + Prisma ORM
- Socket.io
- AWS S3 (file storage)

## Project Structure

```
├── backend/          # Express.js API server
│   ├── src/
│   └── prisma/
├── mobile/           # React Native app
│   ├── src/
│   ├── ios/
│   └── android/
└── docs/             # Documentation
    └── SPECIFICATION.md
```

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL
- Xcode (for iOS development)
- Android Studio (for Android development)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Configure your .env file
npx prisma migrate dev
npx prisma db seed
npm run dev
```

### Mobile Setup

```bash
cd mobile
npm install
cd ios && pod install && cd ..
npm run ios
```

## Documentation

See [docs/SPECIFICATION.md](docs/SPECIFICATION.md) for the complete product specification.

## Design

- **Theme:** Discord-like with blue (#3B82F6) and gold (#F59E0B) accents
- **Mode:** Dark theme primary

## License

Private - All rights reserved
