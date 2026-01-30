# InternHub Backend Setup Guide

This guide walks you through setting up the backend with **Supabase** (PostgreSQL) and **Firebase Auth**.

## Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)
- Firebase account (free tier works)

---

## Step 1: Supabase Setup

### 1.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Enter project details:
   - **Name**: `internhub` (or your choice)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click **Create new project** (takes ~2 minutes)

### 1.2 Get Database Connection String

1. In your Supabase dashboard, go to **Settings** → **Database**
2. Scroll to **Connection string** section
3. Select **URI** tab
4. Copy the connection string (it looks like):
   ```
   postgresql://postgres.[project-ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with your database password

### 1.3 Update .env

```bash
# In backend/.env
DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
DIRECT_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

> **Note**: Use port `5432` for direct connections (migrations). Use port `6543` with `?pgbouncer=true` for pooled connections in production.

---

## Step 2: Firebase Setup

### 2.1 Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Enter project name: `internhub`
4. Disable Google Analytics (optional for MVP)
5. Click **Create project**

### 2.2 Enable Authentication Providers

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Google**:
   - Click Google → Enable → Select support email → Save
3. Enable **Facebook** (optional):
   - Click Facebook → Enable
   - Enter Facebook App ID and Secret (from [developers.facebook.com](https://developers.facebook.com))
   - Copy the OAuth redirect URI for Facebook app settings
   - Save

### 2.3 Get Firebase Admin SDK Credentials

1. Go to **Project Settings** (gear icon) → **Service accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. Open the JSON and copy these values to your `.env`:

```bash
# In backend/.env
FIREBASE_PROJECT_ID="your-project-id"           # from "project_id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-..."   # from "client_email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE..."    # from "private_key" (keep the \n)
```

> **Important**: The private key contains `\n` characters. Keep them as-is in the .env file.

---

## Step 3: Run Migrations

```bash
cd backend

# Generate Prisma client
npm run db:generate

# Run migrations (creates all tables in Supabase)
npm run db:migrate

# Seed the database (creates Super Admin + Default Program)
npm run db:seed
```

### Expected Seed Output:
```
🌱 Starting database seed...

👤 Creating Super Admin user...
   ✅ Created Super Admin: admin@internhub.app

📦 Creating Default Program...
   ✅ Created Default Program: Educational Research Group

🎭 Creating default roles...
   ✅ Created @everyone role
   ✅ Created Moderator role

📁 Creating default categories...
   ✅ Created category: WELCOME
   ✅ Created category: GENERAL
   ✅ Created category: RESOURCES

💬 Creating default channels...
   ✅ Created channel: #welcome
   ✅ Created channel: #announcements
   ✅ Created channel: #general
   ✅ Created channel: #questions
   ✅ Created channel: #resources
   ✅ Created channel: #opportunities

🔗 Adding Super Admin to Default Program...
   ✅ Added Super Admin to Default Program
   ✅ Assigned @everyone role to Super Admin
   ✅ Assigned Moderator role to Super Admin

✨ Database seed completed successfully!
```

---

## Step 4: Start the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm start
```

### Expected Output:
```
✅ Firebase Admin SDK initialized
✅ Database connected
🚀 Server running on http://localhost:3000
📡 Socket.io ready
🌍 Environment: development
```

---

## Step 5: Test the API

### Health Check
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-27T...",
  "environment": "development"
}
```

### API Info
```bash
curl http://localhost:3000/api
```

Response:
```json
{
  "name": "InternHub API",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/api/auth",
    "users": "/api/users",
    "programs": "/api/programs"
  }
}
```

---

## Authentication Flow

The mobile app handles the OAuth flow with Firebase, then sends the token to your backend:

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Mobile App │ ───► │ Firebase Auth │ ───► │ Google/FB   │
└─────────────┘      └──────────────┘      └─────────────┘
       │                    │
       │ Firebase ID Token  │
       ▼                    │
┌─────────────┐             │
│  Your API   │ ◄───────────┘
│  /auth/     │   Verify token
│  firebase   │   Create/get user
└─────────────┘   Return JWT
       │
       │ Your JWT tokens
       ▼
┌─────────────┐
│  Mobile App │  Uses JWT for all API calls
└─────────────┘
```

---

## Environment Variables Summary

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `DATABASE_URL` | Supabase PostgreSQL connection | Supabase Dashboard → Settings → Database |
| `DIRECT_URL` | Direct connection for migrations | Same as above |
| `JWT_ACCESS_SECRET` | Your JWT signing secret | Generate: `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Your refresh token secret | Generate: `openssl rand -hex 32` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console → Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Service account email | Firebase Console → Service Accounts |
| `FIREBASE_PRIVATE_KEY` | Service account private key | Firebase Console → Generate Key |

---

## Troubleshooting

### "Invalid or expired Firebase token"
- Ensure Firebase Admin SDK credentials are correct
- Check that the token hasn't expired (they expire after 1 hour)

### "Database connection failed"
- Verify DATABASE_URL is correct
- Check Supabase project is running
- Ensure password doesn't have special characters that need escaping

### "Firebase initialization failed"
- Check FIREBASE_PRIVATE_KEY has proper `\n` characters
- Verify FIREBASE_CLIENT_EMAIL matches the service account

---

## Next Steps

1. Set up the React Native mobile app
2. Implement Firebase Auth in the mobile app
3. Connect mobile app to this backend API
