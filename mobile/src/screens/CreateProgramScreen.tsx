/**
 * Create Program Screen
 * Multi-step form for creating a new program
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
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types';
import { programApi } from '../services/api';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const STEPS = ['Basic Info', 'Description', 'Privacy'];

export default function CreateProgramScreen() {
  const navigation = useNavigation<NavigationProp>();
  
  // Form state
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canProceed = () => {
    switch (step) {
      case 0:
        return name.trim().length >= 3;
      case 1:
        return true; // Description is optional
      case 2:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCreate();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Program name is required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await programApi.createProgram({
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      });

      if (response.success) {
        Alert.alert(
          'Program Created!',
          `"${name}" has been created successfully. You can now invite others using the invite code.`,
          [
            {
              text: 'View Program',
              onPress: () => {
                navigation.goBack();
                // Navigate to the new program
                navigation.navigate('ProgramDetail', { programId: response.data.program.id });
              },
            },
          ]
        );
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to create program. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((_, index) => (
        <View key={index} style={styles.stepRow}>
          <View
            style={[
              styles.stepDot,
              index <= step && styles.stepDotActive,
              index < step && styles.stepDotCompleted,
            ]}
          >
            {index < step ? (
              <Ionicons name="checkmark" size={14} color={colors.white} />
            ) : (
              <Text style={[styles.stepNumber, index <= step && styles.stepNumberActive]}>
                {index + 1}
              </Text>
            )}
          </View>
          {index < STEPS.length - 1 && (
            <View style={[styles.stepLine, index < step && styles.stepLineActive]} />
          )}
        </View>
      ))}
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your program called?</Text>
            <Text style={styles.stepSubtitle}>
              Choose a name that represents your internship, course, or team
            </Text>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="e.g., Summer Internship"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={100}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={styles.charCount}>{name.length}/100</Text>
            </View>

            <View style={styles.tipsBox}>
              <Text style={styles.tipsTitle}>Tips for a good name:</Text>
              <Text style={styles.tipItem}>• Be specific (include year, cohort, etc.)</Text>
              <Text style={styles.tipItem}>• Keep it recognizable to members</Text>
              <Text style={styles.tipItem}>• You can change it later</Text>
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Add a description</Text>
            <Text style={styles.stepSubtitle}>
              Help members understand what this program is about (optional)
            </Text>
            
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe your program, its goals, or what members can expect..."
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                maxLength={500}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
              <Text style={styles.charCount}>{description.length}/500</Text>
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Set privacy</Text>
            <Text style={styles.stepSubtitle}>
              Control who can join your program
            </Text>

            <View style={styles.privacyOptions}>
              <TouchableOpacity
                style={[styles.privacyOption, !isPrivate && styles.privacyOptionSelected]}
                onPress={() => setIsPrivate(false)}
              >
                <View style={styles.privacyIconContainer}>
                  <Ionicons name="globe-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.privacyTextContainer}>
                  <Text style={styles.privacyTitle}>Public</Text>
                  <Text style={styles.privacyDescription}>
                    Anyone with the invite code can join instantly
                  </Text>
                </View>
                <View style={[styles.radioOuter, !isPrivate && styles.radioOuterSelected]}>
                  {!isPrivate && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.privacyOption, isPrivate && styles.privacyOptionSelected]}
                onPress={() => setIsPrivate(true)}
              >
                <View style={styles.privacyIconContainer}>
                  <Ionicons name="lock-closed" size={24} color={colors.primary} />
                </View>
                <View style={styles.privacyTextContainer}>
                  <Text style={styles.privacyTitle}>Private</Text>
                  <Text style={styles.privacyDescription}>
                    Join requests require admin approval
                  </Text>
                </View>
                <View style={[styles.radioOuter, isPrivate && styles.radioOuterSelected]}>
                  {isPrivate && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            </View>

            {/* Summary */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Program Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name:</Text>
                <Text style={styles.summaryValue}>{name}</Text>
              </View>
              {description.trim() && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Description:</Text>
                  <Text style={styles.summaryValue} numberOfLines={2}>{description}</Text>
                </View>
              )}
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Privacy:</Text>
                <Text style={styles.summaryValue}>{isPrivate ? 'Private' : 'Public'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Default Channels:</Text>
                <Text style={styles.summaryValue}>#general, #announcements</Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={step === 0 ? 'close' : 'arrow-back'} size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Program</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Step Indicator */}
        {renderStepIndicator()}
        <View style={styles.stepLabels}>
          {STEPS.map((label, index) => (
            <Text
              key={label}
              style={[styles.stepLabel, index === step && styles.stepLabelActive]}
            >
              {label}
            </Text>
          ))}
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.nextButton,
              !canProceed() && styles.nextButtonDisabled,
            ]}
            onPress={handleNext}
            disabled={!canProceed() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.nextButtonText}>
                {step === STEPS.length - 1 ? 'Create Program' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
  },
  headerRight: {
    width: 40,
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  stepDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  stepDotCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.textMuted,
  },
  stepNumberActive: {
    color: colors.white,
  },
  stepLine: {
    width: 60,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  stepLineActive: {
    backgroundColor: colors.success,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  stepLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: typography.fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  tipsBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  tipsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  tipItem: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  privacyOptions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  privacyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  privacyOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  privacyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  privacyIcon: {
    fontSize: 24,
  },
  privacyTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  privacyTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  privacyDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  summaryTitle: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    width: 100,
  },
  summaryValue: {
    fontSize: typography.fontSize.sm,
    color: colors.text,
    flex: 1,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nextButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },
});
