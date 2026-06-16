/**
 * Shared helpers for navigating to the forward destination picker.
 */

import { Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export interface ForwardableMessage {
  id: string;
  content: string;
  sendStatus?: 'sending' | 'failed';
  attachments?: { id: string }[];
}

export function canForwardMessage(message: ForwardableMessage): boolean {
  if (message.sendStatus === 'sending' || message.sendStatus === 'failed') return false;
  return UUID_RE.test(message.id);
}

export function openForwardPicker(
  navigation: NavigationProp,
  message: ForwardableMessage,
  previewAuthor: string,
  source: { channelId?: string; conversationId?: string },
): void {
  if (!canForwardMessage(message)) {
    Alert.alert(
      'Not ready',
      'Wait for this message to finish sending before forwarding it.',
    );
    return;
  }

  navigation.navigate('ForwardDestination', {
    messageId: message.id,
    sourceChannelId: source.channelId,
    sourceConversationId: source.conversationId,
    previewText: message.content,
    previewAuthor,
    hasAttachments: (message.attachments?.length ?? 0) > 0,
  });
}
