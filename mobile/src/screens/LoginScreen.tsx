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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { GOOGLE_AUTH_CONFIG } from '../constants/config';
import { useAuthStore } from '../store/authStore';
import { signInWithGoogle, initializeFirebase } from '../services/firebase';

export default function LoginScreen() {
  const { loginWithFirebase, isLoading, error, clearError } = useAuthStore();
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

        console.log('Google Sign-In successful, authenticating with Firebase...');
        
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
      console.error('Google Sign-In error:', error);
      
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled the sign-in flow
        console.log('Sign-in cancelled by user');
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
            <Text style={styles.logoEmoji}>🎓</Text>
          </View>
          <Text style={styles.title}>InternHub</Text>
          <Text style={styles.subtitle}>
            Connect with your internship community
          </Text>
        </View>

        {/* Sign In Buttons */}
        <View style={styles.buttonContainer}>
          {/* Google Sign In */}
          <TouchableOpacity
            style={[styles.button, styles.googleButton]}
            onPress={handleGoogleSignIn}
            disabled={showLoading}
          >
            {showLoading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.buttonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Facebook Sign In (placeholder) */}
          <TouchableOpacity
            style={[styles.button, styles.facebookButton]}
            disabled={showLoading}
            onPress={() => Alert.alert('Coming Soon', 'Facebook login will be available soon.')}
          >
            <Text style={styles.facebookIcon}>f</Text>
            <Text style={[styles.buttonText, { color: colors.white }]}>
              Continue with Facebook
            </Text>
          </TouchableOpacity>
        </View>

        {/* Note about development build */}
        <View style={styles.noteContainer}>
          <Text style={styles.noteText}>
            📱 Requires development build for native Google Sign-In
          </Text>
        </View>

        {/* Terms */}
        <View style={styles.footer}>
          <Text style={styles.termsText}>
            By continuing, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
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
    width: 100,
    height: 100,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logoEmoji: {
    fontSize: 50,
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
  facebookButton: {
    backgroundColor: '#1877F2',
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
  },
  facebookIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  buttonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.background,
  },
  noteContainer: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
  },
  noteText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
  },
  termsText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: colors.primary,
  },
});
