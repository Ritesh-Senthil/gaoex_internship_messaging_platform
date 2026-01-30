/**
 * App Navigator
 * Handles authentication flow and main navigation
 */

import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { colors } from '../constants/theme';
import { useAuthStore } from '../store/authStore';
import { RootStackParamList, MainTabParamList } from '../types';

// Screens
import LoginScreen from '../screens/LoginScreen';
import ProgramsScreen from '../screens/ProgramsScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Create navigators
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Placeholder screens
function DirectMessagesScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>💬</Text>
      <Text style={styles.placeholderTitle}>Direct Messages</Text>
      <Text style={styles.placeholderSubtitle}>Coming soon</Text>
    </View>
  );
}

function NotificationsScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>🔔</Text>
      <Text style={styles.placeholderTitle}>Notifications</Text>
      <Text style={styles.placeholderSubtitle}>Coming soon</Text>
    </View>
  );
}

function JoinProgramScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>➕</Text>
      <Text style={styles.placeholderTitle}>Join Program</Text>
      <Text style={styles.placeholderSubtitle}>Coming soon</Text>
    </View>
  );
}

function ProgramDetailScreen() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>📚</Text>
      <Text style={styles.placeholderTitle}>Program Details</Text>
      <Text style={styles.placeholderSubtitle}>Coming soon</Text>
    </View>
  );
}

/**
 * Tab Navigator for main app screens
 */
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.border,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Programs"
        component={ProgramsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>📚</Text>
          ),
        }}
      />
      <Tab.Screen
        name="DirectMessages"
        component={DirectMessagesScreen}
        options={{
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>🔔</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Main App Navigator
 */
export default function AppNavigator() {
  const { isAuthenticated, isInitialized, isLoading } = useAuthStore();

  // Show loading screen while initializing
  if (!isInitialized || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!isAuthenticated ? (
          // Auth Stack
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // Main App Stack
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="ProgramDetail"
              component={ProgramDetailScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Program',
              }}
            />
            <Stack.Screen
              name="JoinProgram"
              component={JoinProgramScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Join Program',
                presentation: 'modal',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  placeholderText: {
    fontSize: 64,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
