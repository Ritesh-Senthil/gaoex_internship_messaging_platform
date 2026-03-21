# InternHub — App Store Deployment Guide

A step-by-step guide to deploying InternHub from local development to a live App Store listing. Follow the phases in order.

---

## Table of Contents

1. [Prerequisites](#phase-1-prerequisites)
2. [Deploy the Backend to Railway](#phase-2-deploy-the-backend-to-railway)
3. [Configure the Mobile App for Production](#phase-3-configure-the-mobile-app-for-production)
4. [Apple Developer Setup](#phase-4-apple-developer-setup)
5. [Build the Production App](#phase-5-build-the-production-app)
6. [App Store Connect Submission](#phase-6-app-store-connect-submission)
7. [Post-Launch](#phase-7-post-launch)
8. [Checklist](#deployment-checklist)

---

## Phase 1: Prerequisites

Before starting, make sure you have:

- [ ] A working local development setup (backend runs, app builds on simulator)
- [ ] A Supabase project with the database seeded and the `attachments` storage bucket created
- [ ] A Firebase project with Google Sign-In enabled
- [ ] Google Cloud Console OAuth client IDs (iOS + Web) configured
- [ ] A Mac with Xcode 15+ installed
- [ ] A credit/debit card for Apple Developer and Railway accounts

---

## Phase 2: Deploy the Backend to Railway

The backend must be accessible over the public internet (not `localhost`) for the production app.

### 2.1 Create a Railway account

1. Go to [railway.com](https://railway.com) and sign up (GitHub login recommended)
2. Choose the **Pro plan** ($5/month minimum, usage-based beyond that)

### 2.2 Create a new project

1. From the Railway dashboard, click **New Project**
2. Select **Deploy from GitHub repo**
3. Connect your GitHub account and select the InternHub repository
4. Railway will detect the repo — set the **Root Directory** to `backend`

### 2.3 Configure the build

Railway should auto-detect Node.js. Verify these settings under the service's **Settings** tab:

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Start Command** | `npm start` |

### 2.4 Set environment variables

Go to the service's **Variables** tab and add every variable from your `backend/.env`:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your Supabase pooler connection string (port 6543 with `?pgbouncer=true`) |
| `DIRECT_URL` | Your Supabase direct connection string (port 5432) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |
| `FIREBASE_PROJECT_ID` | Your Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Your Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Your Firebase private key (with `\n` characters) |
| `JWT_ACCESS_SECRET` | Your generated access secret |
| `JWT_REFRESH_SECRET` | Your generated refresh secret |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `30d` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `CLIENT_URL` | `https://your-app.up.railway.app` (Railway will provide this) |
| `SUPER_ADMIN_EMAIL` | Your Google account email (the one you'll sign in with) |
| `SUPER_ADMIN_NAME` | Your display name |
| `DEFAULT_PROGRAM_NAME` | `Educational Research Group` |

> **Note on `FIREBASE_PRIVATE_KEY`:** Railway's UI handles multiline values. Paste the full key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. If it doesn't work, wrap the value in double quotes with literal `\n` characters.

### 2.5 Deploy and verify

1. Click **Deploy** (or it may auto-deploy after adding variables)
2. Wait for the build to complete (1–3 minutes)
3. Railway assigns a public URL like `https://internhub-backend-production.up.railway.app`
4. Test the health endpoint:
   ```
   curl https://your-app.up.railway.app/health
   ```
   Expected response:
   ```json
   {"status":"ok","timestamp":"...","environment":"production"}
   ```

### 2.6 (Optional) Add a custom domain

1. In Railway, go to your service's **Settings → Networking → Custom Domain**
2. Add your domain (e.g., `api.internhub.app`)
3. Update your DNS records as instructed by Railway
4. Railway provides free SSL certificates automatically

---

## Phase 3: Configure the Mobile App for Production

### 3.1 Update the production API URLs

Edit `mobile/src/constants/config.ts` and replace the production URLs:

```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__ 
    ? 'http://localhost:3000/api'
    : 'https://your-app.up.railway.app/api',  // ← your Railway URL
  
  SOCKET_URL: __DEV__
    ? 'http://localhost:3000'
    : 'https://your-app.up.railway.app',       // ← your Railway URL (no /api)
  
  TIMEOUT: 30000,
} as const;
```

> Replace `your-app.up.railway.app` with the actual URL Railway assigned (or your custom domain).

### 3.2 Bump the version number

Edit `mobile/app.json`:

```json
{
  "expo": {
    "version": "1.0.0",
    ...
  }
}
```

For subsequent releases, increment the version following [semver](https://semver.org/) (e.g., `1.0.1` for patches, `1.1.0` for features).

### 3.3 Verify app.json configuration

Confirm these fields are correct in `mobile/app.json`:

| Field | Expected Value | Purpose |
|-------|---------------|---------|
| `name` | `InternHub` | Display name on device home screen |
| `slug` | `internhub` | Expo project identifier |
| `version` | `1.0.0` | App Store version |
| `ios.bundleIdentifier` | `com.internhub.app` | Must match Apple Developer and Google OAuth config |
| `icon` | `./assets/icon.png` | App icon (1024x1024 recommended) |
| `splash.image` | `./assets/splash-icon.png` | Launch screen image |

---

## Phase 4: Apple Developer Setup

### 4.1 Enroll in the Apple Developer Program

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs)
2. Click **Enroll** and sign in with your Apple ID
3. Follow the enrollment steps (personal or organization account)
4. Pay the $99/year fee
5. Enrollment is typically approved within 48 hours (sometimes instant for individuals)

> **For an NGO:** You can enroll as an **Organization**, which requires a D-U-N-S number. If you don't have one, enroll as an **Individual** first — you can transfer later.

### 4.2 Add your Apple Developer account to Xcode

1. Open Xcode → **Settings** (⌘,) → **Accounts**
2. Click **+** → **Apple ID**
3. Sign in with the Apple ID associated with your Developer account
4. Your team should appear in the list

### 4.3 Configure signing in Xcode

1. Open `mobile/ios/InternHub.xcworkspace` in Xcode
2. Select the **InternHub** target in the project navigator
3. Go to the **Signing & Capabilities** tab
4. Check **Automatically manage signing**
5. Set **Team** to your Apple Developer team (not "Personal Team")
6. Xcode should resolve signing automatically

### 4.4 Add the Push Notifications capability

1. Still on the **Signing & Capabilities** tab
2. Click **+ Capability**
3. Search for and add **Push Notifications**
4. Xcode will register the entitlement with Apple automatically

### 4.5 Verify capabilities

Your Signing & Capabilities tab should show:

- **Automatically manage signing** ✓
- **Team**: Your Apple Developer team
- **Bundle Identifier**: `com.internhub.app`
- **Push Notifications** capability listed

---

## Phase 5: Build the Production App

You have two options. **EAS Build (Option A)** is recommended for simplicity.

### Option A: EAS Build (Recommended)

EAS (Expo Application Services) builds the app in the cloud, handling code signing and provisioning profiles automatically.

#### 5A.1 Install EAS CLI

```bash
npm install -g eas-cli
```

#### 5A.2 Log in to Expo

```bash
eas login
```

Sign in with your Expo account (create one at [expo.dev](https://expo.dev) if needed).

#### 5A.3 Configure EAS Build

Run this from the `mobile/` directory:

```bash
cd mobile
eas build:configure
```

This creates an `eas.json` file. Edit it to include a production profile:

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "distribution": "store",
      "ios": {
        "buildConfiguration": "Release"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@email.com",
        "ascAppId": "your-app-store-connect-app-id",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

> Fill in `appleId`, `ascAppId` (from App Store Connect, see Phase 6), and `appleTeamId` (from developer.apple.com → Membership).

#### 5A.4 Build for iOS

```bash
eas build --platform ios --profile production
```

EAS will:
1. Ask you to log in to your Apple Developer account
2. Automatically create/manage provisioning profiles and certificates
3. Build the `.ipa` file in the cloud (takes 10–20 minutes)
4. Provide a download link when complete

#### 5A.5 Submit to App Store Connect

After the build completes, submit it directly:

```bash
eas submit --platform ios --profile production
```

Or submit the build from the [Expo dashboard](https://expo.dev) → your project → Builds → Submit.

---

### Option B: Local Build with Xcode

#### 5B.1 Build the native project

```bash
cd mobile
npx expo prebuild --platform ios --clean
```

#### 5B.2 Open in Xcode

```bash
open ios/InternHub.xcworkspace
```

#### 5B.3 Archive the app

1. Select **Any iOS Device (arm64)** as the build target (not a simulator)
2. Go to **Product → Archive**
3. Wait for the build to complete (5–15 minutes)
4. The Organizer window opens with your archive

#### 5B.4 Upload to App Store Connect

1. In the Organizer, select your archive
2. Click **Distribute App**
3. Choose **App Store Connect**
4. Click **Upload**
5. Xcode validates and uploads the build (takes a few minutes)

---

## Phase 6: App Store Connect Submission

### 6.1 Create the app listing

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** → **+** → **New App**
3. Fill in:

| Field | Value |
|-------|-------|
| **Platform** | iOS |
| **Name** | InternHub |
| **Primary Language** | English (U.S.) |
| **Bundle ID** | com.internhub.app (select from dropdown — it appears after Xcode configures signing) |
| **SKU** | `internhub-ios-1` (any unique identifier) |
| **User Access** | Full Access |

### 6.2 Prepare the app metadata

Navigate to your app → **App Store** tab → **iOS App** section:

**App Information:**

| Field | Suggested Value |
|-------|----------------|
| **Category** | Social Networking (primary), Education (secondary) |
| **Content Rights** | Does not contain third-party content |
| **Age Rating** | Fill out the questionnaire (likely 4+ or 9+) |

**Pricing and Availability:**

| Field | Value |
|-------|-------|
| **Price** | Free |
| **Availability** | All territories (or select specific countries) |

**Privacy Policy:**
- You must provide a **Privacy Policy URL** (required by Apple)
- Host it on your NGO's website or use a free service like [getterms.io](https://getterms.io)
- The policy should cover: data collected (email, name, profile photo from Google), messaging data, file uploads, push notification tokens

### 6.3 Prepare screenshots

Apple requires screenshots for at least these device sizes:

| Device Size | Resolution | Required |
|-------------|-----------|----------|
| **6.7" (iPhone 15 Pro Max)** | 1290 × 2796 | Yes |
| **6.5" (iPhone 14 Plus)** | 1284 × 2778 | Yes |
| **5.5" (iPhone 8 Plus)** | 1242 × 2208 | Yes (if supporting older devices) |
| **iPad Pro 12.9"** | 2048 × 2732 | Yes (if `supportsTablet` is true) |

**Recommended screenshots (5–10 per size):**
1. Login screen with "Continue with Google" button
2. Programs list showing program cards
3. Channel view with messages, reactions, and thread indicators
4. Direct Messages list
5. DM conversation with typing indicator
6. Member profile card
7. Search results
8. Program settings / roles

> **Tip:** Take screenshots on the iOS Simulator at the right device size, or use a tool like [shots.so](https://shots.so) or [screenshots.pro](https://screenshots.pro) to add device frames and captions.

### 6.4 Write the App Store description

**Subtitle** (30 chars max):
```
Team Collaboration for Interns
```

**Promotional Text** (170 chars max, can be updated without a new build):
```
Connect with your team in real-time. Channels, DMs, file sharing, and more — built for internship programs and volunteer organizations.
```

**Description** (4000 chars max):
```
InternHub is a mobile-first team collaboration platform designed for internship programs and volunteer organizations. Think Discord or Slack, built specifically for facilitators and students to communicate, share resources, and collaborate.

PROGRAMS
Create or join collaboration spaces with invite codes. Each program has its own channels, roles, and members — perfect for organizing different cohorts or teams.

REAL-TIME MESSAGING
Send messages instantly in channels and direct messages. Messages support bold, italic, code formatting, @mentions, emoji reactions, and threaded replies.

CHANNELS & CATEGORIES
Organize conversations with text channels and announcement channels, grouped into categories. Pin important messages for easy reference.

DIRECT MESSAGES & GROUPS
Chat 1-on-1 or create group conversations with up to 8 people. See typing indicators and online/offline presence in real-time.

FILE SHARING
Share images, documents, videos, and audio files directly in any conversation. Supports all common file formats.

ROLES & PERMISSIONS
A 4-tier role system with 20 granular permissions gives facilitators full control over who can do what within each program.

SEARCH
Find messages, channels, and people instantly with global search across your entire workspace.

PUSH NOTIFICATIONS
Stay informed with notifications for new messages, @mentions, and DMs — even when the app is in the background.

Built with privacy in mind. Sign in securely with your Google account.
```

### 6.5 Select the build

1. In App Store Connect, scroll to the **Build** section
2. Click **+** and select the build you uploaded (it may take 5–30 minutes to appear after upload, as Apple processes it)
3. If the build doesn't appear, check your email for any processing errors

### 6.6 Complete the review information

| Field | Value |
|-------|-------|
| **Contact Information** | Your name, email, phone |
| **Demo Account** | Not needed — the app uses Google Sign-In, which reviewers can use with their own account |
| **Notes for Reviewer** | "This app uses Google Sign-In. You can sign in with any Google account to test. The app automatically joins a default program with sample channels." |

### 6.7 Submit for review

1. Click **Add for Review**
2. Click **Submit to App Review**
3. Apple typically reviews within **24–48 hours**
4. You'll receive an email when the app is approved (or if changes are requested)

### 6.8 Release the app

After approval, choose your release method:

- **Manually release** — you control when it goes live
- **Automatically release** — goes live immediately after approval (recommended for first release)

---

## Phase 7: Post-Launch

### 7.1 Monitor the backend

- Check Railway's **Logs** tab for errors
- Monitor Railway's **Metrics** tab for CPU/memory usage
- Set up Railway's **health check** to auto-restart on crashes:
  - Settings → Health Check Path: `/health`

### 7.2 TestFlight for beta testing

Before submitting to the App Store, you can distribute builds to testers via **TestFlight**:

1. Upload a build to App Store Connect (same process as above)
2. Go to the **TestFlight** tab in App Store Connect
3. Add internal testers (up to 25, must be App Store Connect users)
4. Or create a public link for external testers (up to 10,000)
5. Testers install TestFlight from the App Store and access your app

> TestFlight is a great way to let your NGO team test the app before the public release.

### 7.3 Updating the app

For each new version:

1. Increment the `version` in `mobile/app.json` (e.g., `1.0.0` → `1.0.1`)
2. Build a new production binary (EAS or Xcode)
3. Upload to App Store Connect
4. Add release notes describing what changed
5. Submit for review

### 7.4 Monitoring and analytics (optional)

Consider adding later:
- **Sentry** (free tier) — crash reporting and error tracking
- **Expo Updates** — push JavaScript-only updates without a new App Store review

---

## Deployment Checklist

Use this checklist to track your progress:

### Backend
- [ ] Railway account created and Pro plan activated
- [ ] Backend deployed from GitHub repo with root directory set to `backend`
- [ ] All environment variables set in Railway
- [ ] `NODE_ENV` set to `production`
- [ ] Health check passes: `curl https://your-url.up.railway.app/health`
- [ ] WebSocket connections work (test by running the app against the production backend)

### Mobile App Configuration
- [ ] Production `BASE_URL` and `SOCKET_URL` updated in `config.ts`
- [ ] App `version` set appropriately in `app.json`
- [ ] App icon is finalized (`mobile/assets/icon.png`, 1024x1024)
- [ ] Splash screen is finalized (`mobile/assets/splash-icon.png`)

### Apple Developer
- [ ] Apple Developer Program enrollment approved ($99/year)
- [ ] Apple Developer account added to Xcode
- [ ] Signing configured with your paid team (not Personal Team)
- [ ] Push Notifications capability added in Xcode
- [ ] Bundle ID matches: `com.internhub.app`

### App Store Connect
- [ ] App created in App Store Connect
- [ ] App metadata filled in (name, description, category, age rating)
- [ ] Privacy Policy URL provided
- [ ] Screenshots uploaded for required device sizes
- [ ] Build uploaded and selected
- [ ] Review notes added for Apple reviewer
- [ ] Submitted for App Review

### Post-Launch
- [ ] Health check configured on Railway
- [ ] App approved and released on the App Store
- [ ] Verified sign-in works on a real device
- [ ] Verified push notifications work on a real device
- [ ] Shared the App Store link with your team
