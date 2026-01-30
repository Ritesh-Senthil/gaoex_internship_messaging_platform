import * as admin from 'firebase-admin';
import { config } from './index';

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;

export function initializeFirebase(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Check if credentials are configured
  if (!config.firebase.projectId || !config.firebase.clientEmail || !config.firebase.privateKey) {
    console.warn('⚠️  Firebase credentials not configured. Auth verification will fail.');
    console.warn('   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env');
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        // Handle escaped newlines in private key
        privateKey: config.firebase.privateKey?.replace(/\\n/g, '\n'),
      }),
    });

    console.log('✅ Firebase Admin SDK initialized');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
}

/**
 * Verify a Firebase ID token from the mobile app
 * Returns the decoded token with user info
 */
export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  if (!firebaseApp) {
    initializeFirebase();
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);
  return decodedToken;
}

/**
 * Get Firebase user by UID
 */
export async function getFirebaseUser(uid: string): Promise<admin.auth.UserRecord> {
  if (!firebaseApp) {
    initializeFirebase();
  }

  return admin.auth().getUser(uid);
}

export default admin;
