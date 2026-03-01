/**
 * useAvatar — avatar upload, remove, and platform action sheet logic
 *
 * Extracted from ProfileScreen to keep avatar management self-contained.
 */

import { useState, useCallback } from 'react';
import { Alert, ActionSheetIOS, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { userApi } from '../services/api';
import { User } from '../types';

interface UseAvatarOptions {
  user: User | null;
  updateUser: (user: Partial<User>) => void;
}

export function useAvatar({ user, updateUser }: UseAvatarOptions) {
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const pickAndUploadAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library in Settings to change your avatar.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setIsUploadingAvatar(true);
      setAvatarLoadError(false);

      const response = await userApi.uploadAvatar(result.assets[0].uri);
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
      }
    } catch (error: any) {
      console.error('Avatar upload failed:', error);
      Alert.alert(
        'Upload Failed',
        error?.response?.data?.error?.message ||
          error?.message ||
          'Failed to upload avatar. Please try again.',
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [updateUser]);

  const removeAvatar = useCallback(async () => {
    try {
      setIsUploadingAvatar(true);
      const response = await userApi.removeAvatar();
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
        setAvatarLoadError(false);
      }
    } catch (error: any) {
      console.error('Avatar removal failed:', error);
      Alert.alert(
        'Error',
        error?.response?.data?.error?.message ||
          error?.message ||
          'Failed to remove avatar.',
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [updateUser]);

  const handleAvatarPress = useCallback(() => {
    if (isUploadingAvatar) return;
    const hasAvatar = !!user?.avatarUrl;

    if (Platform.OS === 'ios') {
      const options = hasAvatar
        ? ['Choose from Library', 'Remove Photo', 'Cancel']
        : ['Choose from Library', 'Cancel'];

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: hasAvatar ? 1 : undefined,
          title: 'Profile Photo',
        },
        (idx) => {
          if (idx === 0) pickAndUploadAvatar();
          else if (hasAvatar && idx === 1) {
            Alert.alert('Remove Photo', 'Your avatar will revert to your initial. Continue?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: removeAvatar },
            ]);
          }
        },
      );
    } else {
      const buttons: any[] = [{ text: 'Choose from Library', onPress: pickAndUploadAvatar }];
      if (hasAvatar)
        buttons.push({
          text: 'Remove Photo',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Remove Photo', 'Your avatar will revert to your initial. Continue?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: removeAvatar },
            ]),
        });
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Profile Photo', undefined, buttons);
    }
  }, [isUploadingAvatar, user?.avatarUrl, pickAndUploadAvatar, removeAvatar]);

  return {
    isUploadingAvatar,
    avatarLoadError,
    setAvatarLoadError,
    handleAvatarPress,
  };
}
