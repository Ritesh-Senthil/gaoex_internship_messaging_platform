/**
 * useEditProfile — edit profile modal state and save logic
 *
 * Extracted from ProfileScreen. Manages display name, bio, and banner color editing.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { userApi } from '../services/api';
import { User } from '../types';
import { colors } from '../constants/theme';

const BIO_MAX = 280;
const DEFAULT_BANNER_COLOR: string = colors.primary;

interface UseEditProfileOptions {
  user: User | null;
  updateUser: (user: Partial<User>) => void;
}

export { BIO_MAX };

export function useEditProfile({ user, updateUser }: UseEditProfileOptions) {
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editBannerColor, setEditBannerColor] = useState(DEFAULT_BANNER_COLOR);
  const [isSaving, setIsSaving] = useState(false);

  const handleEditProfile = useCallback(() => {
    setEditDisplayName(user?.displayName || '');
    setEditBio(user?.bio || '');
    setEditBannerColor(user?.bannerColor || DEFAULT_BANNER_COLOR);
    setIsEditModalVisible(true);
  }, [user?.displayName, user?.bio, user?.bannerColor]);

  const closeEditModal = useCallback(() => {
    setIsEditModalVisible(false);
  }, []);

  const handleSaveProfile = useCallback(async () => {
    const trimmedName = editDisplayName.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }
    if (trimmedName.length > 50) {
      Alert.alert('Error', 'Display name must be 50 characters or less');
      return;
    }
    const trimmedBio = editBio.trim();
    if (trimmedBio.length > BIO_MAX) {
      Alert.alert('Error', `Bio must be ${BIO_MAX} characters or less`);
      return;
    }

    setIsSaving(true);
    try {
      const response = await userApi.updateProfile({
        displayName: trimmedName,
        bio: trimmedBio || null,
        bannerColor: editBannerColor,
      });
      if (response.success && response.data?.user) {
        updateUser(response.data.user);
        setIsEditModalVisible(false);
      }
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.response?.data?.error?.message ||
          error?.message ||
          'Failed to update profile',
      );
    } finally {
      setIsSaving(false);
    }
  }, [editDisplayName, editBio, editBannerColor, updateUser]);

  return {
    isEditModalVisible,
    editDisplayName,
    setEditDisplayName,
    editBio,
    setEditBio,
    editBannerColor,
    setEditBannerColor,
    isSaving,
    handleEditProfile,
    handleSaveProfile,
    closeEditModal,
  };
}
