/**
 * useMessageEdit — shared inline-edit logic for ChannelScreen and ConversationScreen
 *
 * Parameterized by the API edit function so the same hook works for both channel and DM messages.
 */

import { useState, useCallback, useRef } from 'react';
import { TextInput, Alert } from 'react-native';

type EditApiFn<T> = (
  entityId: string,
  messageId: string,
  content: string,
) => Promise<{ success: boolean; data: { message: T } }>;

export function useMessageEdit<T extends { id: string; content: string }>(
  editApiFn: EditApiFn<T>,
  entityId: string,
  setMessages: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const [editingMessage, setEditingMessage] = useState<T | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const startEdit = useCallback((message: T) => {
    setEditingMessage(message);
    setEditText(message.content);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setEditText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingMessage || !editText.trim()) return;

    try {
      const response = await editApiFn(entityId, editingMessage.id, editText.trim());
      if (response.success) {
        setMessages(prev =>
          prev.map(m => (m.id === editingMessage.id ? response.data.message : m)),
        );
        setEditingMessage(null);
        setEditText('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to edit message');
    }
  }, [editingMessage, editText, editApiFn, entityId, setMessages]);

  return {
    editingMessage,
    editText,
    setEditText,
    inputRef,
    startEdit,
    cancelEdit,
    saveEdit,
  };
}
