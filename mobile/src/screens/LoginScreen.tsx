/**
 * Login Screen
 * Handles Google Sign-In using native Google Sign-In SDK
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../constants/theme';
import { GOOGLE_AUTH_CONFIG, APP_CONFIG } from '../constants/config';
import { useAuthStore } from '../store/authStore';
import { signInWithGoogle, initializeFirebase } from '../services/firebase';
import AppLogo from '../components/AppLogo';

const SCREENSHOT_EMAIL = typeof process !== 'undefined'
  ? process.env.EXPO_PUBLIC_SCREENSHOT_EMAIL
  : undefined;

export default function LoginScreen() {
  const { loginWithFirebase, loginWithDevEmail, isLoading, error, clearError } = useAuthStore();
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Initialize Firebase and Google Sign-In
  useEffect(() => {
    initializeFirebase();
    
    // Configure Google Sign-In
    GoogleSignin.configure({
      iosClientId: GOOGLE_AUTH_CONFIG.iosClientId,
      webClientId: GOOGLE_AUTH_CONFIG.webClientId,
      offlineAccess: true,
    });
  }, []);

  // Auto-login for local App Store screenshot capture (__DEV__ only)
  useEffect(() => {
    if (!__DEV__ || !SCREENSHOT_EMAIL) return;
    let cancelled = false;
    (async () => {
      setIsSigningIn(true);
      try {
        await loginWithDevEmail(SCREENSHOT_EMAIL);
      } finally {
        if (!cancelled) setIsSigningIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Show error alert
  useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    
    try {
      // Check if Google Play Services is available (Android only)
      await GoogleSignin.hasPlayServices();
      
      // Sign in with Google
      const response = await GoogleSignin.signIn();
      
      if (isSuccessResponse(response)) {
        const { idToken } = response.data;
        
        if (!idToken) {
          throw new Error('No ID token received from Google');
        }

        // Sign in with Firebase using Google token
        await signInWithGoogle(idToken);
        
        // Authenticate with our backend
        const success = await loginWithFirebase();
        
        if (!success) {
          // If backend auth failed, sign out of Google
          await GoogleSignin.signOut();
        }
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — no action needed
      } else if (error.code === statusCodes.IN_PROGRESS) {
        // Sign-in is already in progress
        Alert.alert('Please wait', 'Sign-in is already in progress');
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        // Play services not available (Android)
        Alert.alert('Error', 'Google Play Services is not available');
      } else {
        Alert.alert('Sign In Failed', error.message || 'Please try again');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const showLoading = isLoading || isSigningIn;

  return (
    <LinearGradient
      colors={[colors.background, colors.backgroundSecondary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.content}>
        {/* Logo & Title */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <AppLogo size={100} />
          </View>
          <Text style={styles.title}>{APP_CONFIG.APP_NAME}</Text>
          <Text style={styles.subtitle}>
            Connect with your internship community
          </Text>
        </View>

        {/* Sign In Buttons */}
        <View style={styles.buttonContainer}>
          {/* Google Sign In */}
          <TouchableOpacity
            style={[styles.button, styles.googleButton, showLoading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={showLoading}
          >
            {showLoading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
                <Text style={styles.buttonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  header: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  title: {
    fontSize: typography.fontSize.display,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.lg,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  googleButton: {
    backgroundColor: colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.background,
  },
});
