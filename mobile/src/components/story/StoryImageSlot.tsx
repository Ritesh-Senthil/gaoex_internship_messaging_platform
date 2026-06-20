/**
 * Placeholder / image slot for the internship story.
 * Pass `source` (remote URI or require()) later; until then shows a labeled frame.
 */

import React from 'react';
import { View, Text, StyleSheet, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, borderRadius, typography } from '../../constants/theme';

export type StoryImageVariant = 'hero' | 'feature' | 'inline' | 'compact' | 'portrait' | 'partner';

const VARIANT_STYLES: Record<
  StoryImageVariant,
  { aspectRatio?: number; minHeight?: number; maxHeight?: number; flex?: number }
> = {
  hero: { aspectRatio: 16 / 9, minHeight: 200 },
  feature: { aspectRatio: 4 / 3, minHeight: 160 },
  inline: { aspectRatio: 2 / 1, minHeight: 140 },
  compact: { aspectRatio: 3 / 2, minHeight: 100, maxHeight: 140 },
  portrait: { aspectRatio: 3 / 4, minHeight: 180, maxHeight: 240 },
  partner: { aspectRatio: 1, minHeight: 72, maxHeight: 88 },
};

export interface StoryImageSlotProps {
  variant: StoryImageVariant;
  /** Remote URL or local require — optional until assets exist */
  source?: ImageSourcePropType | string | null;
  /** Shown on placeholder; also used as accessibility label hint */
  label?: string;
  style?: StyleProp<ViewStyle>;
  /** Edge-to-edge (no side radius) when parent sets full width */
  fullBleed?: boolean;
}

function isRenderableSource(source: StoryImageSlotProps['source']): source is NonNullable<typeof source> {
  if (source == null) return false;
  if (typeof source === 'string' || typeof source === 'number') return true;
  if (typeof source === 'object' && source !== null && ('uri' in source || 'default' in source)) return true;
  return false;
}

export default function StoryImageSlot({ variant, source, label, style, fullBleed }: StoryImageSlotProps) {
  const dim = VARIANT_STYLES[variant];
  const hasImage = isRenderableSource(source);

  return (
    <View
      style={[
        styles.wrap,
        fullBleed && styles.wrapFullBleed,
        {
          aspectRatio: dim.aspectRatio,
          minHeight: dim.minHeight,
          maxHeight: dim.maxHeight,
        },
        style,
      ]}
      accessibilityLabel={label ? `Image: ${label}` : 'Image placeholder'}
      accessibilityRole="image"
    >
      {hasImage ? (
        <Image
          source={typeof source === 'string' ? source : (source as ImageSourcePropType)}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={variant === 'partner' ? 28 : 36} color={colors.textMuted} />
          {label ? (
            <Text style={[styles.placeholderLabel, variant === 'partner' && styles.placeholderLabelSmall]} numberOfLines={2}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wrapFullBleed: {
    borderRadius: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  placeholderLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: typography.fontWeight.medium,
  },
  placeholderLabelSmall: {
    fontSize: typography.fontSize.xs,
  },
});
