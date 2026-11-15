/**
 * Reliable stack back button — explicit hit target for screens with heavy headerRight chrome.
 * Channel, DM, and thread hide the native back control and render this instead.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { RootStackParamList } from '../types';

interface StackBackButtonProps {
  tintColor?: string;
}

export default function StackBackButton({ tintColor = colors.text }: StackBackButtonProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (route.name === 'Conversation') {
      navigation.navigate('Main', { screen: 'DirectMessages' });
      return;
    }

    if (route.name === 'Channel') {
      const programId = (route.params as RootStackParamList['Channel'] | undefined)?.programId;
      if (programId) {
        navigation.navigate('ProgramDetail', { programId });
      } else {
        navigation.navigate('Main');
      }
      return;
    }

    if (route.name === 'Thread') {
      const params = route.params as RootStackParamList['Thread'] | undefined;
      if (params?.channelId && params.programId) {
        navigation.navigate('Channel', {
          channelId: params.channelId,
          programId: params.programId,
          channelName: params.channelName || 'channel',
        });
        return;
      }
      if (params?.conversationId) {
        navigation.navigate('Conversation', {
          conversationId: params.conversationId,
          name: params.conversationName || 'Direct Message',
        });
        return;
      }
      navigation.navigate('Main');
      return;
    }

    navigation.navigate('Main');
  };

  return (
    <TouchableOpacity
      onPress={goBack}
      style={styles.button}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
