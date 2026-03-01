/**
 * useAttachments — shared file attachment state for ChannelScreen and ConversationScreen
 */

import { useState, useCallback } from 'react';
import { SelectedFile } from '../components/AttachmentPicker';

export function useAttachments(maxFiles = 5) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const openPicker = useCallback(() => setShowPicker(true), []);
  const closePicker = useCallback(() => setShowPicker(false), []);

  const addFiles = useCallback(
    (files: SelectedFile[]) => {
      setSelectedFiles(prev => [...prev, ...files].slice(0, maxFiles));
    },
    [maxFiles],
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const resetUpload = useCallback(() => {
    setIsUploading(false);
    setUploadProgress(0);
  }, []);

  return {
    selectedFiles,
    showPicker,
    uploadProgress,
    isUploading,
    openPicker,
    closePicker,
    addFiles,
    removeFile,
    clearFiles,
    setUploadProgress,
    setIsUploading,
    resetUpload,
  };
}
