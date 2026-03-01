# InternHub — Local Development Setup

This guide walks you through setting up InternHub for local development from scratch. No prior knowledge of the codebase is assumed.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone the Repository](#2-clone-the-repository)
3. [Create a Supabase Project](#3-create-a-supabase-project)
4. [Create a Firebase Project](#4-create-a-firebase-project)
5. [Configure Google Sign-In](#5-configure-google-sign-in)
6. [Backend Setup](#6-backend-setup)
7. [Database Setup](#7-database-setup)
8. [Mobile App Setup](#8-mobile-app-setup)
9. [Running the App](#9-running-the-app)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Install these before continuing:

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18 or later | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **npm** | Comes with Node.js | — |
| **Xcode** | 15+ | Mac App Store (required for iOS simulator) |
| **Xcode Command Line Tools** | — | `xcode-select --install` |
| **CocoaPods** | 1.14+ | `sudo gem install cocoapods` |
| **Git** | Any recent version | `brew install git` |

> **Note:** Android development is possible but iOS is the primary target. This guide focuses on iOS.

---

## 2. Clone the Repository

```bash
git clone <your-repo-url>
cd internhub
```

The project has two main folders:
- `backend/` — The API server
- `mobile/` — The React Native app

---

## 3. Create a Supabase Project

Supabase provides the PostgreSQL database and file storage (for avatars and attachments).

### 3.1 Create the project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account)
2. Click **New Project**
3. Choose an organization, enter a project name (e.g., `internhub`), and set a database password
4. Select a region close to you
5. Click **Create new project** and wait for it to initialize

### 3.2 Get your database connection strings

1. In the Supabase dashboard, go to **Settings → Database**
2. Scroll to **Connection string** section
3. Copy the **URI** connection string (it looks like `postgresql://postgres.[ref]:[password]@...`)
4. You'll need two versions:
   - **`DATABASE_URL`**: The connection pooler URI (port `6543`, append `?pgbouncer=true`)
   - **`DIRECT_URL`**: The direct connection URI (port `5432`)

Example:
```
DATABASE_URL="postgresql://postgres.abcxyz:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcxyz:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

### 3.3 Get your Supabase API credentials

1. In the dashboard, go to **Settings → API**
2. Copy:
   - **Project URL** → This becomes `SUPABASE_URL`
   - **Service role key** (under "Project API keys") → This becomes `SUPABASE_SERVICE_KEY`

> **Important:** The service role key bypasses Row Level Security. Never expose it in client-side code.

### 3.4 Create a storage bucket

1. In the dashboard, go to **Storage**
2. Click **New bucket**
3. Name it `attachments`
4. Set it to **Public** (so uploaded files can be accessed via URL)
5. Click **Create bucket**

---

## 4. Create a Firebase Project

Firebase handles Google Sign-In authentication.

### 4.1 Create the project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project**
3. Name it (e.g., `internhub`) and follow the setup wizard
4. Disable Google Analytics if you don't need it (not required)

### 4.2 Enable Google Sign-In

1. In the Firebase console, go to **Authentication → Sign-in method**
2. Click **Google** and enable it
3. Add a support email address
4. Click **Save**

### 4.3 Add a Web App (for the mobile client Firebase config)

1. Go to **Project Settings → General**
2. Under "Your apps", click the web icon (`</>`) to add a web app
3. Register it with a nickname (e.g., `internhub-web`)
4. Copy the config object — you'll need `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`
5. These values go into `mobile/src/constants/config.ts` under `FIREBASE_CONFIG`

### 4.4 Get the service account key (for the backend)

1. Go to **Project Settings → Service accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. From this file, you need three values for `backend/.env`:
   - `FIREBASE_PROJECT_ID` → `project_id` field
   - `FIREBASE_CLIENT_EMAIL` → `client_email` field
   - `FIREBASE_PRIVATE_KEY` → `private_key` field (keep the `\n` characters)

---

## 5. Configure Google Sign-In

Google Sign-In requires OAuth 2.0 client IDs configured in Google Cloud Console.

### 5.1 Open Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select the project that Firebase created (same project name)

### 5.2 Create OAuth Client IDs

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**

**Create an iOS client:**
- Application type: **iOS**
- Bundle ID: `com.internhub.app`
- Copy the **Client ID** → this becomes `iosClientId` in `mobile/src/constants/config.ts`

**Create a Web client** (also needed for the mobile OAuth flow):
- Application type: **Web application**
- No redirect URIs needed
- Copy the **Client ID** → this becomes `webClientId` in `mobile/src/constants/config.ts`

### 5.3 Update mobile config

Edit `mobile/src/constants/config.ts` and replace the placeholder values:

```typescript
export const FIREBASE_CONFIG = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
} as const;

export const GOOGLE_AUTH_CONFIG = {
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
} as const;
```

### 5.4 Update the iOS URL scheme

The Google Sign-In plugin needs your **reversed iOS client ID** as a URL scheme.

1. Open `mobile/app.json`
2. Find the `@react-native-google-signin/google-signin` plugin config
3. Replace the `iosUrlScheme` value with your reversed iOS client ID:
   ```
   com.googleusercontent.apps.YOUR_IOS_CLIENT_ID
   ```
   (Reverse the client ID: if your client ID is `123456.apps.googleusercontent.com`, the URL scheme is `com.googleusercontent.apps.123456`)

---

## 6. Backend Setup

### 6.1 Install dependencies

```bash
cd backend
npm install
```

### 6.2 Create the environment file

```bash
cp .env.example .env
```

### 6.3 Fill in the environment variables

Open `backend/.env` and fill in every value:

| Variable | Where to find it |
|----------|-----------------|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (pooler, port 6543) |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string (direct, port 5432) |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → Service role key |
| `FIREBASE_PROJECT_ID` | Firebase service account JSON → `project_id` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account JSON → `client_email` |
| `FIREBASE_PRIVATE_KEY` | Firebase service account JSON → `private_key` |
| `JWT_ACCESS_SECRET` | Generate: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` (use a different value) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` (default) |
| `JWT_REFRESH_EXPIRES_IN` | `30d` (default) |
| `NODE_ENV` | `development` |
| `PORT` | `3000` |
| `CLIENT_URL` | `http://localhost:8081` |
| `SUPER_ADMIN_EMAIL` | Your Google account email (the one you'll sign in with) |
| `SUPER_ADMIN_NAME` | Your display name |
| `DEFAULT_PROGRAM_NAME` | Name for the default program (e.g., `Educational Research Group`) |

---

## 7. Database Setup

### 7.1 Generate the Prisma client

```bash
cd backend
npx prisma generate
```

### 7.2 Push the schema to the database

```bash
npx prisma db push
```

This creates all the tables in your Supabase database.

### 7.3 Seed the database

```bash
npm run db:seed
```

This creates:
- A Super Admin user (with the email from your `.env`)
- A Default Program called "Educational Research Group"
- Default roles (@everyone and Facilitator)
- Default categories (WELCOME, GENERAL, RESOURCES)
- Default channels (#welcome, #announcements, #general, #questions, #resources, #opportunities)

### 7.4 Verify (optional)

You can inspect your database with Prisma Studio:

```bash
npx prisma studio
```

This opens a web UI at `http://localhost:5555` where you can browse all tables.

---

## 8. Mobile App Setup

### 8.1 Install dependencies

```bash
cd mobile
npm install
```

### 8.2 Install iOS native dependencies

```bash
cd ios
pod install
cd ..
```

> If `pod install` fails, try `pod install --repo-update`.

### 8.3 Verify the API URL

Open `mobile/src/constants/config.ts` and confirm the development URLs:

```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://localhost:3000/api'
    : 'https://your-production-api.com/api',
  SOCKET_URL: __DEV__
    ? 'http://localhost:3000'
    : 'https://your-production-api.com',
};
```

For the iOS simulator, `localhost` works. If you're testing on a physical device, replace `localhost` with your computer's local IP address (e.g., `http://192.168.1.100:3000/api`).

---

## 9. Running the App

### 9.1 Start the backend

```bash
cd backend
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3000
📡 Socket.io ready
🌍 Environment: development
```

Verify it's working:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","environment":"development"}
```

### 9.2 Start the mobile app

In a separate terminal:

```bash
cd mobile
npx expo run:ios
```

This will:
1. Build the native iOS app (first build takes several minutes)
2. Install it on the iOS simulator
3. Launch the app

> **Why `expo run:ios` instead of `expo start`?** Google Sign-In uses a native SDK that requires a development build, not Expo Go.

### 9.3 Sign in

1. The app opens to the Login screen
2. Tap **Continue with Google**
3. Sign in with a Google account
4. You'll be automatically added to the Default Program

> **Tip:** If you sign in with the same email you put in `SUPER_ADMIN_EMAIL`, you'll have Super Admin privileges (bypasses all permission checks).

---

## 10. Troubleshooting

### Backend won't start

**"Cannot find module '@prisma/client'"**
```bash
cd backend && npx prisma generate
```

**"P1001: Can't reach database server"**
- Check that your `DATABASE_URL` in `.env` is correct
- Make sure your Supabase project is active (not paused)

**"Firebase App not initialized"**
- Check that `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are set correctly
- The private key should include `\n` line breaks, wrapped in double quotes

### Mobile build fails

**"No signing certificate"**
- Open `mobile/ios/internhub.xcworkspace` in Xcode
- Select the target → Signing & Capabilities → set your Team

**CocoaPods errors**
```bash
cd mobile/ios
pod deintegrate
pod install --repo-update
```

**"Unable to resolve module"**
```bash
cd mobile
rm -rf node_modules
npm install
cd ios && pod install
```

### Google Sign-In doesn't work

**"DEVELOPER_ERROR" or sign-in silently fails**
- Verify your `iosClientId` and `webClientId` in `config.ts` match Google Cloud Console
- Verify the iOS URL scheme in `app.json` is the reversed iOS client ID
- Make sure the Firebase project has Google Sign-In enabled
- Rebuild the app after changing config: `npx expo run:ios`

**Sign-in works but backend returns 401**
- The backend verifies the Firebase ID token. Make sure the `FIREBASE_PROJECT_ID` in `backend/.env` matches your Firebase project

### Socket connection fails

**Messages don't appear in real-time**
- Check the backend terminal for connection logs
- Verify `SOCKET_URL` in `mobile/src/constants/config.ts` points to `http://localhost:3000` (no `/api` suffix)
- If testing on a physical device, use your machine's IP address instead of `localhost`

### Database issues

**Reset the database completely**
```bash
cd backend
npx prisma db push --force-reset
npm run db:seed
```

> **Warning:** This deletes all data.

**View database contents**
```bash
cd backend
npx prisma studio
```

---

## Environment Variable Reference

### backend/.env

```bash
# Supabase Database
DATABASE_URL="postgresql://..."          # Pooled connection (port 6543)
DIRECT_URL="postgresql://..."            # Direct connection (port 5432)

# Supabase Storage
SUPABASE_URL="https://xxx.supabase.co"   # Project URL
SUPABASE_SERVICE_KEY="eyJ..."            # Service role key

# Firebase Auth
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-...@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# JWT
JWT_ACCESS_SECRET="<random-hex-32>"      # openssl rand -hex 32
JWT_REFRESH_SECRET="<random-hex-32>"     # openssl rand -hex 32
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

# Server
NODE_ENV="development"
PORT=3000
CLIENT_URL="http://localhost:8081"

# Seed Data
SUPER_ADMIN_EMAIL="your-google-email@gmail.com"
SUPER_ADMIN_NAME="Your Name"
DEFAULT_PROGRAM_NAME="Educational Research Group"
```

### mobile/src/constants/config.ts

```typescript
// API URLs (hardcoded, no .env needed)
API_CONFIG.BASE_URL   // Dev: http://localhost:3000/api
API_CONFIG.SOCKET_URL // Dev: http://localhost:3000

// Firebase (from Firebase Console → Project Settings → Web app)
FIREBASE_CONFIG.apiKey
FIREBASE_CONFIG.authDomain
FIREBASE_CONFIG.projectId
FIREBASE_CONFIG.storageBucket
FIREBASE_CONFIG.messagingSenderId
FIREBASE_CONFIG.appId

// Google OAuth (from Google Cloud Console → Credentials)
GOOGLE_AUTH_CONFIG.iosClientId
GOOGLE_AUTH_CONFIG.webClientId
GOOGLE_AUTH_CONFIG.androidClientId
```
