/**
 * InternHub Theme Constants
 * Premium dark theme — black, striking blue, gold
 */

export const colors = {
  // Primary brand colors
  primary: '#0A84FF',        // iOS system blue — vibrant, accessible
  primaryDark: '#0066CC',
  primaryLight: '#409CFF',

  // Accent colors
  accent: '#FFD700',         // Rich gold
  accentDark: '#C9A84C',
  accentLight: '#FFE44D',

  // Background colors (true black base)
  background: '#000000',
  backgroundSecondary: '#0A0A0F',
  backgroundTertiary: '#111118',
  backgroundModifier: '#1A1A24',

  // Surface colors (cards, bubbles, elevated content)
  surface: '#111118',
  surfaceLight: '#1A1A24',
  surfaceHover: '#22222E',

  // Text colors
  text: '#FFFFFF',
  textSecondary: '#A0A4B0',
  textMuted: '#5C5F6A',
  textLink: '#0A84FF',
  textOnPrimary: 'rgba(255, 255, 255, 0.85)',

  // Status colors
  success: '#30D158',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#0A84FF',

  // Online status
  online: '#30D158',
  idle: '#FFD60A',
  dnd: '#FF453A',
  offline: '#636366',

  // Channel colors
  channelText: '#636366',
  channelTextHover: '#D1D1D6',

  // Border/divider
  border: '#1C1C2A',
  divider: '#1C1C2A',

  // Role tier colors (centralized — used by MemberDirectory, RolesList, RoleDetail, etc.)
  tierOwner: '#FFD700',      // Gold
  tierAdmin: '#E74C3C',      // Red
  tierMember: '#95A5A6',     // Gray
  roleDefault: '#99AAB5',    // Fallback when role has no color

  // Overlay / utility
  overlay: 'rgba(0, 0, 0, 0.85)',
  highlightBg: 'rgba(10, 132, 255, 0.15)',

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

// Role color picker palette (shared by CreateRole + RoleDetail)
export const ROLE_COLORS = [
  '#E74C3C', '#E91E63', '#9B59B6', '#8E44AD',
  '#3498DB', '#2196F3', '#00BCD4', '#009688',
  '#2ECC71', '#4CAF50', '#FF9800', '#FF5722',
  '#795548', '#607D8B', '#FFD700', '#99AAB5',
] as const;

export const shadows = {
  sm: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 2,
  },
  md: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 6,
  },
  lg: {
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.36,
    shadowRadius: 6.68,
    elevation: 10,
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
