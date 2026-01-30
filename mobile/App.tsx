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

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize Firebase
    initializeFirebase();
    
    // Initialize auth state
    initialize();
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
