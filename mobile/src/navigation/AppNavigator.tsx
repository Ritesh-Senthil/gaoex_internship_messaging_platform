/**
 * App Navigator
 * Handles authentication flow and main navigation
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Image } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/theme';
import { useAuthStore } from '../store/authStore';
import { RootStackParamList, MainTabParamList } from '../types';
import {
  navigationRef,
  setNavigationReady,
  consumePendingNavigation,
  navigateFromNotification,
} from '../services/navigationRef';
import {
  addNotificationResponseListener,
  getInitialNotification,
  NotificationData,
} from '../services/notifications';

// Screens
import LoginScreen from '../screens/LoginScreen';
import ProgramsScreen from '../screens/ProgramsScreen';
import ProgramDetailScreen from '../screens/ProgramDetailScreen';
import ChannelScreen from '../screens/ChannelScreen';
import ProfileScreen from '../screens/ProfileScreen';
import JoinProgramScreen from '../screens/JoinProgramScreen';
import CreateProgramScreen from '../screens/CreateProgramScreen';
import ProgramSettingsScreen from '../screens/ProgramSettingsScreen';
import MemberDirectoryScreen from '../screens/MemberDirectoryScreen';
import MemberProfileScreen from '../screens/MemberProfileScreen';
import RolesListScreen from '../screens/RolesListScreen';
import RoleDetailScreen from '../screens/RoleDetailScreen';
import CreateRoleScreen from '../screens/CreateRoleScreen';
import AssignRolesScreen from '../screens/AssignRolesScreen';
import ConversationsListScreen from '../screens/ConversationsListScreen';
import ConversationScreen from '../screens/ConversationScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import GroupInfoScreen from '../screens/GroupInfoScreen';
import ThreadScreen from '../screens/ThreadScreen';
import ChannelManagementScreen from '../screens/ChannelManagementScreen';
import ChannelPermissionsScreen from '../screens/ChannelPermissionsScreen';
import SearchScreen from '../screens/SearchScreen';
import PinnedMessagesScreen from '../screens/PinnedMessagesScreen';
import ForwardDestinationScreen from '../screens/ForwardDestinationScreen';
import { ENABLE_INTERNSHIP_STORY } from '../features/internshipStory';
import { internshipStoryScreenProps } from '../features/internshipStoryNavigation';

// Create navigators
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// SearchTabScreen is just the SearchScreen rendered directly in the tab


/**
 * Profile Tab Icon - Shows user's avatar image or initial in a circular badge
 */
function ProfileTabIcon({ focused, size }: { focused: boolean; size: number }) {
  const { user } = useAuthStore();
  const initial = user?.displayName?.charAt(0).toUpperCase() || '?';
  const [imgError, setImgError] = useState(false);
  const showImage = !!user?.avatarUrl && !imgError;
  const dim = size + 4;

  return (
    <View
      style={{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        overflow: 'hidden',
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? colors.primary : colors.textMuted,
        backgroundColor: focused ? colors.primary : colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: user!.avatarUrl! }}
          style={{ width: dim, height: dim }}
          onError={() => setImgError(true)}
        />
      ) : (
        <Text
          style={{
            fontSize: size * 0.55,
            fontWeight: '700',
            color: focused ? colors.white : colors.textMuted,
          }}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

/**
 * Profile Tab Label - Shows user's first name
 */
function ProfileTabLabel({ focused }: { focused: boolean }) {
  const { user } = useAuthStore();
  const firstName = user?.displayName?.split(' ')[0] || 'Profile';
  
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '500',
        color: focused ? colors.primary : colors.textMuted,
      }}
    >
      {firstName}
    </Text>
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
          paddingTop: 5,
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
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="DirectMessages"
        component={ConversationsListScreen}
        options={{
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ focused }) => <ProfileTabLabel focused={focused} />,
          tabBarIcon: ({ focused, size }) => (
            <ProfileTabIcon focused={focused} size={size} />
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
  const hasHandledInitialNotification = useRef(false);

  // Handle notification taps while app is running (warm start)
  useEffect(() => {
    if (!isAuthenticated) return;

    const cleanup = addNotificationResponseListener((data: NotificationData) => {
      navigateFromNotification(data);
    });

    return cleanup;
  }, [isAuthenticated]);

  // Handle cold start: check if app was opened via a notification tap
  useEffect(() => {
    if (!isAuthenticated || hasHandledInitialNotification.current) return;

    async function checkInitialNotification() {
      try {
        const data = await getInitialNotification();
        if (data && data.type) {
          // Small delay to ensure navigation is fully ready
          setTimeout(() => {
            navigateFromNotification(data);
          }, 500);
        }
      } catch (error) {
        // silently ignore
      } finally {
        hasHandledInitialNotification.current = true;
      }
    }

    checkInitialNotification();
  }, [isAuthenticated]);

  // Process any pending navigations when navigator becomes ready
  const handleNavigationReady = useCallback(() => {
    setNavigationReady(true);
    const pending = consumePendingNavigation();
    if (pending) {
      // Small delay to let the navigation state settle
      setTimeout(() => {
        navigateFromNotification(pending);
      }, 300);
    }
  }, []);

  // Show loading screen while initializing
  if (!isInitialized || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={handleNavigationReady}>
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
            {/* [INTERNSHIP_STORY] — remove block + feature files to revert */}
            {ENABLE_INTERNSHIP_STORY ? <Stack.Screen {...internshipStoryScreenProps} /> : null}
            <Stack.Screen
              name="ProgramDetail"
              component={ProgramDetailScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Program',
              }}
            />
            <Stack.Screen
              name="Channel"
              component={ChannelScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                headerBackVisible: false,
                title: `#${route.params?.channelName || 'Channel'}`,
              })}
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
            <Stack.Screen
              name="CreateProgram"
              component={CreateProgramScreen}
              options={{
                headerShown: false,
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="ProgramSettings"
              component={ProgramSettingsScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Program Settings',
              })}
            />
            <Stack.Screen
              name="MemberDirectory"
              component={MemberDirectoryScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Members',
              })}
            />
            <Stack.Screen
              name="MemberProfile"
              component={MemberProfileScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: (route.params as any)?.memberName || 'Profile',
              })}
            />
            <Stack.Screen
              name="RolesList"
              component={RolesListScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Roles',
              }}
            />
            <Stack.Screen
              name="RoleDetail"
              component={RoleDetailScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: route.params?.roleName || 'Role',
              })}
            />
            <Stack.Screen
              name="CreateRole"
              component={CreateRoleScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Create Role',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="AssignRoles"
              component={AssignRolesScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Assign Roles',
                presentation: 'modal',
              })}
            />
            <Stack.Screen
              name="Conversation"
              component={ConversationScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                headerBackVisible: false,
                title: route.params?.name || 'Conversation',
              })}
            />
            <Stack.Screen
              name="NewConversation"
              component={NewConversationScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'New Message',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="ForwardDestination"
              component={ForwardDestinationScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Forward to...',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="Thread"
              component={ThreadScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerBackVisible: false,
                title: 'Thread',
              }}
            />
            <Stack.Screen
              name="GroupInfo"
              component={GroupInfoScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Group Info',
              }}
            />
            <Stack.Screen
              name="ChannelManagement"
              component={ChannelManagementScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: 'Channel Management',
              }}
            />
            <Stack.Screen
              name="ChannelPermissions"
              component={ChannelPermissionsScreen}
              options={({ route }) => ({
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                title: `#${route.params?.channelName} Permissions`,
              })}
            />
            <Stack.Screen
              name="PinnedMessages"
              component={PinnedMessagesScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: colors.backgroundSecondary },
                headerTintColor: colors.text,
                headerTitleStyle: { fontWeight: '600' },
                title: 'Pinned Messages',
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
});
