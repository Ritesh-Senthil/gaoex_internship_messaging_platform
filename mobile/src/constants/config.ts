/**
 * App Configuration
 */

// API Configuration
export const API_CONFIG = {
  // Change this to your backend URL
  // For local development with iOS simulator: use your machine's IP
  // For Android emulator: use 10.0.2.2
  BASE_URL: __DEV__ 
    ? 'http://localhost:3000/api'  // Development
    : 'https://your-production-api.com/api', // Production
  
  SOCKET_URL: __DEV__
    ? 'http://localhost:3000'
    : 'https://your-production-api.com',
  
  TIMEOUT: 30000, // 30 seconds
} as const;

// Firebase Configuration
// Get these from Firebase Console → Project Settings → Your apps → Web app
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBIR8_3a4bdP-kvglRaQyKM0NpPT9tQc-k',
  authDomain: 'internhub-810c2.firebaseapp.com',
  projectId: 'internhub-810c2',
  storageBucket: 'internhub-810c2.firebasestorage.app',
  messagingSenderId: '543948018812',
  appId: '1:543948018812:web:1d6fb70bd20696576e65f9',
} as const;

// Google Sign-In Configuration (for Expo)
export const GOOGLE_AUTH_CONFIG = {
  // Get from Google Cloud Console → Credentials → OAuth 2.0 Client IDs
  // Create an iOS client ID and Web client ID
  iosClientId: '543948018812-5nv38bcnot6qd3pecsov6bubtij3ftas.apps.googleusercontent.com',
  webClientId: '543948018812-rqgco48r6bbrk3iljr86pf6kk0l3gi71.apps.googleusercontent.com',
  // Android client ID (if needed)
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
} as const;

// App Constants
export const APP_CONFIG = {
  APP_NAME: 'InternHub',
  VERSION: '1.0.0',
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MESSAGES_PAGE_SIZE: 100,
  
  // Timeouts
  TYPING_TIMEOUT: 3000, // 3 seconds
  
  // Storage keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    USER: 'user',
  },
} as const;
