/**
 * InternHub Theme Constants
 * Discord-inspired with blue and gold accents
 */

export const colors = {
  // Primary brand colors
  primary: '#3B82F6',      // Blue
  primaryDark: '#2563EB',
  primaryLight: '#60A5FA',
  
  // Accent colors
  accent: '#F59E0B',       // Gold
  accentDark: '#D97706',
  accentLight: '#FBBF24',
  
  // Background colors (Discord-inspired dark theme)
  background: '#1E1F22',
  backgroundSecondary: '#2B2D31',
  backgroundTertiary: '#313338',
  backgroundModifier: '#383A40',
  
  // Surface colors
  surface: '#2B2D31',
  surfaceLight: '#313338',
  surfaceHover: '#383A40',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: '#B5BAC1',
  textMuted: '#6D6F78',
  textLink: '#00A8FC',
  
  // Status colors
  success: '#23A559',
  warning: '#F0B232',
  error: '#F23F43',
  info: '#5865F2',
  
  // Online status
  online: '#23A559',
  idle: '#F0B232',
  dnd: '#F23F43',
  offline: '#80848E',
  
  // Channel colors
  channelText: '#80848E',
  channelTextHover: '#DBDEE1',
  
  // Border/divider
  border: '#3F4147',
  divider: '#3F4147',
  
  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const borderRadius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  // Font sizes
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 32,
  },
  
  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
} as const;

export const theme = {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
} as const;

export type Theme = typeof theme;
export type Colors = typeof colors;
