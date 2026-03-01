/**
 * InternHub Mobile App
 * Discord-like messaging platform for internship programs
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore } from './src/store/authStore';
import { initializeFirebase } from './src/services/firebase';
import { colors } from './src/constants/theme';
import { configureNotificationHandler, startAppStateTokenRefresh } from './src/services/notifications';

// Configure notification display behavior BEFORE any notification arrives.
// This MUST be called at module level (outside component) per Expo docs.
configureNotificationHandler();

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={colors.background} />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
