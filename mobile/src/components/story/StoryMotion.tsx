/**
 * Scroll-linked motion for the internship story: Reanimated context, sections, parallax, stagger.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { colors, spacing } from '../../constants/theme';

// ─── Scroll context ───────────────────────────────────────────

export type StoryScrollContextValue = {
  scrollY: SharedValue<number>;
  reduceMotion: SharedValue<number>;
  viewportH: SharedValue<number>;
  contentH: SharedValue<number>;
};

const StoryScrollContext = createContext<StoryScrollContextValue | null>(null);
const SectionYContext = createContext<SharedValue<number> | null>(null);

export function useStoryScroll() {
  const c = useContext(StoryScrollContext);
  if (!c) {
    throw new Error('useStoryScroll must be used within StoryScrollProvider');
  }
  return c;
}

export function useSectionYOptional() {
  return useContext(SectionYContext);
}

export function StoryScrollProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: StoryScrollContextValue;
}) {
  return <StoryScrollContext.Provider value={value}>{children}</StoryScrollContext.Provider>;
}

export function useStoryScrollSetup() {
  const scrollY = useSharedValue(0);
  const reduceMotion = useSharedValue(0);
  const viewportH = useSharedValue(600);
  const contentH = useSharedValue(2000);
  const trackW = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v: boolean) => {
      if (mounted) reduceMotion.value = v ? 1 : 0;
    });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => {
      reduceMotion.value = v ? 1 : 0;
    });
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, [reduceMotion]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const value = useMemo(
    () => ({ scrollY, reduceMotion, viewportH, contentH }),
    [scrollY, reduceMotion, viewportH, contentH],
  );

  const progressStyle = useAnimatedStyle(() => {
    const max = Math.max(1, contentH.value - viewportH.value);
    const t = Math.min(1, Math.max(0, scrollY.value / max));
    return { width: t * trackW.value };
  });

  return { value, scrollHandler, trackW, progressStyle };
}

// ─── Progress bar ─────────────────────────────────────────────

export function StoryProgressBar({
  topInset,
  trackW,
  progressStyle,
}: {
  topInset: number;
  trackW: SharedValue<number>;
  progressStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  const onTrackLayout = useCallback(
    (e: LayoutChangeEvent) => {
      trackW.value = e.nativeEvent.layout.width;
    },
    [trackW],
  );

  return (
    <View style={[styles.progressTrack, { top: topInset }]} pointerEvents="none" onLayout={onTrackLayout}>
      <Animated.View style={[styles.progressFill, progressStyle]} />
    </View>
  );
}

// ─── Hero parallax layers ─────────────────────────────────────

export function HeroBackdropOrb() {
  const { scrollY, reduceMotion } = useStoryScroll();
  const style = useAnimatedStyle(() => {
    if (reduceMotion.value) {
      return { transform: [{ translateY: 0 }] };
    }
    return {
      transform: [{ translateY: scrollY.value * 0.06 }],
    };
  });
  return <Animated.View style={[styles.heroOrb, style]} pointerEvents="none" />;
}

export function HeroParallaxImage({ style: outerStyle, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const { scrollY, reduceMotion } = useStoryScroll();
  const style = useAnimatedStyle(() => {
    if (reduceMotion.value) {
      return { transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const ty = interpolate(scrollY.value, [0, 380], [0, 76], Extrapolation.CLAMP);
    const scale = interpolate(scrollY.value, [-72, 0], [1.06, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty }, { scale }] };
  });
  return (
    <Animated.View style={[styles.heroImageParallax, outerStyle, style]}>{children}</Animated.View>
  );
}

export function HeroSecondaryParallax({ style: outerStyle, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const { scrollY, reduceMotion } = useStoryScroll();
  const style = useAnimatedStyle(() => {
    if (reduceMotion.value) {
      return { transform: [{ translateY: 0 }] };
    }
    const ty = interpolate(scrollY.value, [0, 520], [0, 42], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty }] };
  });
  return <Animated.View style={[outerStyle, style]}>{children}</Animated.View>;
}

export function HeroScrollHint({ children }: { children: React.ReactNode }) {
  const { scrollY, reduceMotion } = useStoryScroll();
  const style = useAnimatedStyle(() => {
    if (reduceMotion.value) {
      return { opacity: 0.85 };
    }
    return {
      opacity: interpolate(scrollY.value, [0, 72], [0.9, 0], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

// ─── Section enter + stagger ──────────────────────────────────

export function StorySection({
  children,
  finale = false,
  band = false,
}: {
  children: React.ReactNode;
  finale?: boolean;
  band?: boolean;
}) {
  const { scrollY, reduceMotion, viewportH } = useStoryScroll();
  const sectionY = useSharedValue(-1);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      sectionY.value = e.nativeEvent.layout.y;
    },
    [sectionY],
  );

  const animatedStyle = useAnimatedStyle(() => {
    const y = sectionY.value;
    const vh = viewportH.value;
    if (reduceMotion.value === 1 || y < 0) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const enterStart = finale ? y - vh * 0.88 : y - vh * 0.92;
    const enterEnd = finale ? y - vh * 0.22 : y - vh * 0.34;
    const tyMax = finale ? 52 : 30;
    return {
      opacity: interpolate(scrollY.value, [enterStart, enterEnd], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollY.value, [enterStart, enterEnd], [tyMax, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <View onLayout={onLayout}>
      <Animated.View style={[animatedStyle, band && styles.sectionBand]}>
        <SectionYContext.Provider value={sectionY}>{children}</SectionYContext.Provider>
      </Animated.View>
    </View>
  );
}

export function StaggerItem({
  index,
  children,
  style: layoutStyle,
}: {
  index: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const sectionY = useSectionYOptional();
  const { scrollY, reduceMotion, viewportH } = useStoryScroll();

  const style = useAnimatedStyle(() => {
    if (!sectionY || reduceMotion.value === 1) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const y = sectionY.value;
    if (y < 0) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }
    const vh = viewportH.value;
    const base = y - vh * 0.72 + index * 46;
    const end = base + 100;
    return {
      opacity: interpolate(scrollY.value, [base, end], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(scrollY.value, [base, end], [20, 0], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return <Animated.View style={[style, layoutStyle]}>{children}</Animated.View>;
}

export function AnimatedStoryDivider() {
  const sectionY = useSectionYOptional();
  const { scrollY, reduceMotion, viewportH } = useStoryScroll();

  const diamondStyle = useAnimatedStyle(() => {
    if (!sectionY || reduceMotion.value === 1) {
      return { opacity: 1, transform: [{ rotate: '45deg' }, { scale: 1 }] };
    }
    const y = sectionY.value;
    if (y < 0) {
      return { opacity: 1, transform: [{ rotate: '45deg' }, { scale: 1 }] };
    }
    const vh = viewportH.value;
    const start = y - vh * 0.95;
    const end = y - vh * 0.55;
    const sc = interpolate(scrollY.value, [start, end], [0.65, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(scrollY.value, [start, end], [0.35, 1], Extrapolation.CLAMP),
      transform: [{ rotate: '45deg' }, { scale: sc }],
    };
  });

  const lineStyle = useAnimatedStyle(() => {
    if (!sectionY || reduceMotion.value === 1) {
      return { opacity: 0.55 };
    }
    const y = sectionY.value;
    if (y < 0) {
      return { opacity: 0.55 };
    }
    const vh = viewportH.value;
    const start = y - vh * 0.92;
    const end = y - vh * 0.6;
    return {
      opacity: interpolate(scrollY.value, [start, end], [0.2, 0.55], Extrapolation.CLAMP),
    };
  });

  return (
    <View style={styles.dividerRow}>
      <Animated.View style={[styles.dividerLine, lineStyle]} />
      <Animated.View style={[styles.dividerDiamond, diamondStyle]} />
      <Animated.View style={[styles.dividerLine, lineStyle]} />
    </View>
  );
}

export function ParallaxInlineImage({
  children,
  strength = 22,
}: {
  children: React.ReactNode;
  strength?: number;
}) {
  const sectionY = useSectionYOptional();
  const { scrollY, reduceMotion, viewportH } = useStoryScroll();

  const style = useAnimatedStyle(() => {
    if (!sectionY || reduceMotion.value === 1) {
      return { transform: [{ translateY: 0 }] };
    }
    const y = sectionY.value;
    if (y < 0) {
      return { transform: [{ translateY: 0 }] };
    }
    const vh = viewportH.value;
    const mid = y + 80;
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [mid - vh * 0.5, mid + vh * 0.35],
            [-strength * 0.35, strength * 0.45],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    height: 3,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  heroOrb: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.primary + '14',
  },
  heroImageParallax: {
    overflow: 'visible',
  },
  sectionBand: {
    alignSelf: 'stretch',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.backgroundSecondary + '99',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xxl + 4,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerDiamond: {
    width: 7,
    height: 7,
    backgroundColor: colors.accent,
  },
});
