# InternHub Mobile App Setup Guide

## Prerequisites

- Node.js 18+ (20.19.4+ recommended)
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Xcode) or Android Emulator
- Expo Go app on your physical device (optional)

---

## Step 1: Configure Firebase

### 1.1 Get Firebase Web Config

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (same one used for backend)
3. Go to **Project Settings** → **General** → **Your apps**
4. Click **Add app** → Select **Web** (</> icon)
5. Register app with nickname "InternHub Mobile"
6. Copy the config values

### 1.2 Update Firebase Config

Edit `mobile/src/constants/config.ts`:

```typescript
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSy...',                    // from firebaseConfig
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project-id',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
};
```

---

## Step 2: Configure Google Sign-In

### 2.1 Create OAuth Client IDs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**

Create these client IDs:

#### Web Client (Required for Expo)
- Application type: **Web application**
- Name: "InternHub Web Client"
- Authorized JavaScript origins: Add your Expo dev URL
- Authorized redirect URIs: Add your Expo auth callback URL
- Copy the **Client ID**

#### iOS Client
- Application type: **iOS**
- Name: "InternHub iOS"
- Bundle ID: `com.internhub.mobile` (or your bundle ID)
- Copy the **Client ID**

#### Android Client (Optional for now)
- Application type: **Android**
- Name: "InternHub Android"
- Package name: `com.internhub.mobile`
- SHA-1: Get from `expo credentials:manager`

### 2.2 Update Google Auth Config

Edit `mobile/src/constants/config.ts`:

```typescript
export const GOOGLE_AUTH_CONFIG = {
  iosClientId: 'xxx.apps.googleusercontent.com',      // iOS client ID
  webClientId: 'xxx.apps.googleusercontent.com',      // Web client ID
  androidClientId: 'xxx.apps.googleusercontent.com',  // Android client ID (optional)
};
```

---

## Step 3: Configure API URL

Edit `mobile/src/constants/config.ts`:

```typescript
export const API_CONFIG = {
  // For iOS Simulator with local backend:
  BASE_URL: 'http://localhost:3000/api',
  
  // For Android Emulator with local backend:
  // BASE_URL: 'http://10.0.2.2:3000/api',
  
  // For physical device with local backend (use your computer's IP):
  // BASE_URL: 'http://192.168.x.x:3000/api',
  
  // For production:
  // BASE_URL: 'https://your-api.com/api',
  
  SOCKET_URL: 'http://localhost:3000', // Same pattern as above
  TIMEOUT: 30000,
};
```

---

## Step 4: Run the App

### Start Backend First
```bash
cd backend
npm run dev
```

### Start Mobile App
```bash
cd mobile

# Start Expo development server
npx expo start

# Press 'i' for iOS Simulator
# Press 'a' for Android Emulator
# Scan QR code with Expo Go app for physical device
```

---

## Project Structure

```
mobile/
├── App.tsx                      # Main app entry
├── src/
│   ├── components/              # Reusable UI components
│   ├── screens/                 # Screen components
│   │   ├── LoginScreen.tsx      # Google sign-in
│   │   ├── ProgramsScreen.tsx   # List of programs
│   │   └── ProfileScreen.tsx    # User profile
│   ├── navigation/
│   │   └── AppNavigator.tsx     # Navigation setup
│   ├── services/
│   │   ├── api.ts               # API client (axios)
│   │   └── firebase.ts          # Firebase config
│   ├── store/
│   │   └── authStore.ts         # Auth state (zustand)
│   ├── constants/
│   │   ├── config.ts            # App configuration
│   │   └── theme.ts             # Colors, spacing, typography
│   ├── types/
│   │   └── index.ts             # TypeScript types
│   └── utils/                   # Utility functions
├── package.json
└── app.json                     # Expo config
```

---

## Authentication Flow

```
┌─────────────────┐
│  Login Screen   │
│  (LoginScreen)  │
└────────┬────────┘
         │ User taps "Continue with Google"
         ▼
┌─────────────────┐
│  Expo AuthSession│
│  Google OAuth    │
└────────┬────────┘
         │ Returns Google ID token
         ▼
┌─────────────────┐
│  Firebase Auth   │
│  signInWith      │
│  Credential      │
└────────┬────────┘
         │ Firebase user created/signed in
         ▼
┌─────────────────┐
│  Get Firebase    │
│  ID Token        │
└────────┬────────┘
         │ Firebase ID token
         ▼
┌─────────────────┐
│  POST /api/auth/ │
│  firebase        │
│  (Your Backend)  │
└────────┬────────┘
         │ Returns your JWT + user data
         ▼
┌─────────────────┐
│  Store tokens    │
│  Navigate to     │
│  Main Screen     │
└─────────────────┘
```

---

## Troubleshooting

### "Network request failed"
- Ensure backend is running
- Check API_CONFIG.BASE_URL matches your setup
- For physical device, use your computer's local IP, not localhost

### "Invalid client ID"
- Verify Google OAuth client IDs are correct
- Ensure you're using the Web client ID for `webClientId`
- Check Firebase project matches Google Cloud project

### "Firebase: Error (auth/invalid-credential)"
- Verify Firebase config values are correct
- Ensure Google Sign-In is enabled in Firebase Auth

### Metro bundler issues
```bash
# Clear cache and restart
npx expo start --clear
```

---

## Next Steps

After basic auth works:

1. **Implement Join Program screen** - Enter invite code to join
2. **Build Program Detail screen** - Show channels and members
3. **Create Channel screen** - Display and send messages
4. **Add real-time messaging** - Socket.io integration
5. **Implement push notifications** - Firebase Cloud Messaging
