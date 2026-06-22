/**
 * Reliable stack back button — explicit hit target for screens with heavy headerRight chrome.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

interface StackBackButtonProps {
  tintColor?: string;
}

export default function StackBackButton({ tintColor = colors.text }: StackBackButtonProps) {
  const navigation = useNavigation();

  if (!navigation.canGoBack()) return null;

  return (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={styles.button}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name="chevron-back" size={28} color={tintColor} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: -4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
