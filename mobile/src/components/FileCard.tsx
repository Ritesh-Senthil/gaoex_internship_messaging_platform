/**
 * FileCard Component
 * Displays file attachments in a Slack-style card format
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius } from '../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface AttachmentData {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  category?: 'image' | 'video' | 'audio' | 'document';
}

interface FileCardProps {
  attachment: AttachmentData;
  onDelete?: () => void;
  showDelete?: boolean;
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIconName(mimeType: string): keyof typeof Ionicons.glyphMap {
  if (mimeType.startsWith('image/')) return 'image-outline';
  if (mimeType.startsWith('video/')) return 'videocam-outline';
  if (mimeType.startsWith('audio/')) return 'musical-notes-outline';
  if (mimeType.includes('pdf')) return 'document-text-outline';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document-outline';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'grid-outline';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'easel-outline';
  if (mimeType.includes('text')) return 'reader-outline';
  return 'attach-outline';
}

// Helper to get file type label
function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType.includes('text')) return 'Text';
  return 'File';
}

export default function FileCard({ attachment, onDelete, showDelete = false }: FileCardProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isMedia = isImage || isVideo;

  const handlePress = async () => {
    if (isImage) {
      setShowPreview(true);
    } else {
      // Open file in browser/external app
      try {
        const supported = await Linking.canOpenURL(attachment.fileUrl);
        if (supported) {
          await Linking.openURL(attachment.fileUrl);
        } else {
          Alert.alert('Error', 'Cannot open this file type');
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to open file');
      }
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Attachment',
      `Are you sure you want to delete "${attachment.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  // Render image preview modal
  const renderPreviewModal = () => (
    <Modal
      visible={showPreview}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPreview(false)}
    >
      <View style={styles.previewOverlay}>
        <TouchableOpacity
          style={styles.previewCloseButton}
          onPress={() => setShowPreview(false)}
        >
          <Ionicons name="close" size={22} color={colors.white} />
        </TouchableOpacity>
        
        <Image
          source={{ uri: attachment.fileUrl }}
          style={styles.previewImage}
          resizeMode="contain"
        />
        
        <View style={styles.previewInfo}>
          <Text style={styles.previewFileName} numberOfLines={1}>
            {attachment.fileName}
          </Text>
          <Text style={styles.previewFileSize}>
            {formatFileSize(attachment.fileSize)}
          </Text>
        </View>
      </View>
    </Modal>
  );

  // Render image card
  if (isImage && !imageError) {
    return (
      <>
        <TouchableOpacity
          style={styles.imageCard}
          onPress={handlePress}
          activeOpacity={0.9}
        >
          {imageLoading && (
            <View style={styles.imagePlaceholder}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}
          <Image
            source={{ uri: attachment.fileUrl }}
            style={[styles.imagePreview, imageLoading && styles.hidden]}
            resizeMode="cover"
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageLoading(false);
              setImageError(true);
            }}
          />
          
          {showDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Ionicons name="close" size={14} color={colors.white} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {renderPreviewModal()}
      </>
    );
  }

  // Render document/video/audio card
  return (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.fileIconContainer}>
        <Ionicons name={getFileIconName(attachment.mimeType)} size={20} color={colors.primary} />
      </View>
      
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {attachment.fileName}
        </Text>
        <View style={styles.fileMeta}>
          <Text style={styles.fileType}>{getFileTypeLabel(attachment.mimeType)}</Text>
          <Text style={styles.fileDot}>•</Text>
          <Text style={styles.fileSize}>{formatFileSize(attachment.fileSize)}</Text>
        </View>
      </View>
      
      <View style={styles.downloadIcon}>
        <Ionicons name="download-outline" size={18} color={colors.textMuted} />
      </View>

      {showDelete && (
        <TouchableOpacity
          style={styles.fileDeleteButton}
          onPress={handleDelete}
        >
          <Ionicons name="close" size={12} color={colors.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// Component to display multiple attachments in a message
export function AttachmentList({ 
  attachments, 
  onDelete,
  showDelete = false,
}: { 
  attachments: AttachmentData[];
  onDelete?: (id: string) => void;
  showDelete?: boolean;
}) {
  if (!attachments || attachments.length === 0) return null;

  // Separate images and other files
  const images = attachments.filter(a => a.mimeType.startsWith('image/'));
  const otherFiles = attachments.filter(a => !a.mimeType.startsWith('image/'));

  return (
    <View style={styles.attachmentList}>
      {/* Image grid */}
      {images.length > 0 && (
        <View style={styles.imageGrid}>
          {images.map((attachment) => (
            <FileCard
              key={attachment.id}
              attachment={attachment}
              showDelete={showDelete}
              onDelete={onDelete ? () => onDelete(attachment.id) : undefined}
            />
          ))}
        </View>
      )}
      
      {/* Other files */}
      {otherFiles.map((attachment) => (
        <FileCard
          key={attachment.id}
          attachment={attachment}
          showDelete={showDelete}
          onDelete={onDelete ? () => onDelete(attachment.id) : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Image card styles
  imageCard: {
    position: 'relative',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
    width: 200,
    height: 150,
  },
  imagePreview: {
    width: 200,
    height: 150,
    borderRadius: borderRadius.md,
  },
  imagePlaceholder: {
    width: 200,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
  },
  
  // File card styles
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },


  fileInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  fileName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text,
    marginBottom: 2,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileType: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  fileDot: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  fileSize: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
  },
  downloadIcon: {
    padding: spacing.xs,
  },


  
  // Delete button
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileDeleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },


  
  // Preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },


  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  previewInfo: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  previewFileName: {
    fontSize: typography.fontSize.md,
    color: colors.white,
    fontWeight: typography.fontWeight.medium,
    marginBottom: 4,
  },
  previewFileSize: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  
  // Attachment list
  attachmentList: {
    marginTop: spacing.sm,
    width: '100%',
  },
  imageGrid: {
    width: '100%',
  },
});
