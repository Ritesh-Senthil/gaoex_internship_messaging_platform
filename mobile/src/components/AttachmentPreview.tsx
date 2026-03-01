/**
 * AttachmentPreview Component
 * Shows selected files before sending with ability to remove
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '../constants/theme';
import { SelectedFile } from './AttachmentPicker';

interface AttachmentPreviewProps {
  files: SelectedFile[];
  onRemove: (index: number) => void;
  isUploading?: boolean;
  uploadProgress?: number;
}

// Helper to format file size
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to get file icon
function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('word')) return '📘';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙';
  return '📄';
}

export default function AttachmentPreview({
  files,
  onRemove,
  isUploading = false,
  uploadProgress = 0,
}: AttachmentPreviewProps) {
  if (files.length === 0) return null;

  return (
    <View style={styles.container}>
      {isUploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.uploadingText}>
            Uploading... {Math.round(uploadProgress * 100)}%
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${uploadProgress * 100}%` }]} />
          </View>
        </View>
      )}
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {files.map((file, index) => {
          const isImage = file.type.startsWith('image/');
          
          return (
            <View key={`${file.uri}-${index}`} style={styles.fileItem}>
              {isImage ? (
                <Image source={{ uri: file.uri }} style={styles.thumbnail} />
              ) : (
                <View style={styles.filePlaceholder}>
                  <Text style={styles.fileIcon}>{getFileIcon(file.type)}</Text>
                </View>
              )}
              
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name}
                </Text>
                {file.size && (
                  <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                )}
              </View>
              
              {!isUploading && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onRemove(index)}
                >
                  <Text style={styles.removeIcon}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  uploadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    flex: 1,
  },
  progressBar: {
    flex: 2,
    height: 4,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  fileItem: {
    width: 120,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  thumbnail: {
    width: 120,
    height: 80,
    backgroundColor: colors.background,
  },
  filePlaceholder: {
    width: 120,
    height: 80,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIcon: {
    fontSize: 32,
  },
  fileInfo: {
    padding: spacing.xs,
  },
  fileName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 10,
    color: colors.textMuted,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: {
    fontSize: 10,
    color: colors.white,
    fontWeight: 'bold',
  },
});
