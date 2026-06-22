/**
 * Join Program Screen
 * Allows users to join a program via invite code
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types';
import { programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function JoinProgramScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    const code = inviteCode.trim().toUpperCase();
    
    if (!code) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }

    if (code.length < 4) {
      Alert.alert('Error', 'Invite code must be at least 4 characters');
      return;
    }

    setIsLoading(true);

    try {
      const response = await programApi.joinProgram(code);

      if (response.success) {
        const data = response.data;
        
        // Check if it's a pending join request (private program)
        if (data.status === 'PENDING') {
          Alert.alert(
            'Request Submitted',
            `Your request to join "${data.programName}" has been submitted. You'll be notified when it's approved.`,
            [
              {
                text: 'OK',
                onPress: () => navigation.goBack(),
              },
            ]
          );
        } else if (data.program) {
          // Successfully joined (public program)
          Alert.alert(
            'Success!',
            `You've joined ${data.program.name}`,
            [
              {
                text: 'OK',
                onPress: () => navigation.goBack(),
              },
            ]
          );
        } else {
          Alert.alert(
            'Joined',
            'You have been added to the program.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        }
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to join program. Please check the invite code and try again.';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="link-outline" size={48} color={colors.primary} />
          <Text style={styles.title}>Join a Program</Text>
          <Text style={styles.subtitle}>
            Enter the invite code shared by your program facilitator
          </Text>
        </View>

        {/* Input */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Invite Code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., WELCOME1"
            placeholderTextColor={colors.textMuted}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            editable={!isLoading}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <Text style={styles.hint}>
            Invite codes are case-insensitive
          </Text>
        </View>

        {/* Join Button */}
        <TouchableOpacity
          style={[styles.joinButton, isLoading && styles.joinButtonDisabled]}
          onPress={handleJoin}
          disabled={isLoading || !inviteCode.trim()}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.joinButtonText}>Join Program</Text>
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Don't have an invite code?</Text>
          <Text style={styles.infoText}>
            Ask your program facilitator or team lead to share the invite code with you.
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.xl,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: typography.fontWeight.bold,
  },
  hint: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  joinButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
  },
  infoTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
