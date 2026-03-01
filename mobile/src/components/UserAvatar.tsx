/**
 * UserAvatar Component
 * Reusable avatar with image support, initial fallback, and optional online indicator.
 * Used across profile cards, member lists, conversation lists, and message bubbles.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ViewStyle } from 'react-native';
import { colors, typography } from '../constants/theme';

// Deterministic color from name (same palette used previously across the app)
const AVATAR_COLORS = ['#5865F2', '#57F287', '#FEE75C', '#EB459E', '#ED4245'];

function getAvatarColor(name: string): string {
  const index = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

interface UserAvatarProps {
  /** Display name — used for fallback initial and color */
  name: string;
  /** Remote image URL (nullable) */
  avatarUrl?: string | null;
  /** Diameter of the avatar circle */
  size?: number;
  /** Show an online/status indicator dot */
  showStatus?: boolean;
  /** Color of the status dot (online green, idle yellow, etc.) */
  statusColor?: string;
  /** Extra styles on the outer wrapper */
  style?: ViewStyle;
}

export default function UserAvatar({
  name,
  avatarUrl,
  size = 44,
  showStatus = false,
  statusColor = colors.online,
  style,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const showImage = !!avatarUrl && !imgError;
  const initial = name?.charAt(0).toUpperCase() || '?';
  const half = size / 2;
  const fontSize = size * 0.42; // scales nicely at any size
  const dotSize = Math.max(size * 0.27, 10);
  const dotBorder = Math.max(dotSize * 0.2, 2);

  return (
    <View style={[{ width: size, height: size, position: 'relative' }, style]}>
      {showImage ? (
        <Image
          source={{ uri: avatarUrl! }}
          style={{
            width: size,
            height: size,
            borderRadius: half,
            backgroundColor: colors.surfaceLight,
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: half,
            backgroundColor: getAvatarColor(name),
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize,
              fontWeight: typography.fontWeight.bold,
              color: colors.white,
            }}
          >
            {initial}
          </Text>
        </View>
      )}

      {showStatus && (
        <View
          style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: statusColor,
            borderWidth: dotBorder,
            borderColor: colors.background,
          }}
        />
      )}
    </View>
  );
}

export { getAvatarColor };
