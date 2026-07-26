/**
 * InternHub Mobile App
 * Discord-like messaging platform for internship programs
 */

import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { initializeFirebase } from './src/services/firebase';
import { colors } from './src/constants/theme';
import { configureNotificationHandler, startAppStateTokenRefresh } from './src/services/notifications';
import {
  navigateToTab,
  navigateToProgram,
  navigateToChannel,
  navigateToConversation,
} from './src/services/navigationRef';

// Configure notification display behavior BEFORE any notification arrives.
// This MUST be called at module level (outside component) per Expo docs.
configureNotificationHandler();

function handleScreenshotDeepLink(url: string) {
  if (!__DEV__) return;
  try {
    const parsed = new URL(url.replace('internhub://', 'https://internhub.local/'));
    const path = parsed.pathname.replace(/^\//, '');
    const q = parsed.searchParams;

    if (path === 'shot/programs') navigateToTab('Programs');
    else if (path === 'shot/dms') navigateToTab('DirectMessages');
    else if (path === 'shot/search') navigateToTab('SearchTab');
    else if (path === 'shot/profile') navigateToTab('Profile');
    else if (path === 'shot/program') navigateToProgram(q.get('id') || '');
    else if (path === 'shot/channel') {
      navigateToChannel(
        q.get('id') || '',
        q.get('name') || 'channel',
        q.get('programId') || ''
      );
    } else if (path === 'shot/conversation') {
      navigateToConversation(q.get('id') || '', q.get('name') || 'Direct Message');
    } else if (path === 'shot/logout') {
      // Fire-and-forget — used only for capturing the login screen
      void useAuthStore.getState().logout();
    } else if (path === 'shot/dev-login') {
      const email = q.get('email') || process.env.EXPO_PUBLIC_SCREENSHOT_EMAIL || '';
      if (email) void useAuthStore.getState().loginWithDevEmail(email);
    }
  } catch {
    // ignore malformed screenshot URLs
  }
}

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize Firebase
    initializeFirebase();
    
    // Initialize auth state (this also triggers push token registration)
    initialize();

    // Re-check push token when app returns to foreground
    const cleanupTokenRefresh = startAppStateTokenRefresh();

    return () => {
      cleanupTokenRefresh();
    };
  }, []);

  useEffect(() => {
    if (!__DEV__) return;

    Linking.getInitialURL().then((url) => {
      if (url) setTimeout(() => handleScreenshotDeepLink(url), 800);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleScreenshotDeepLink(url);
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.background} />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
