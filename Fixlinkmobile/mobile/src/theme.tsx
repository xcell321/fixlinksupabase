import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

export const colors = {
  ink: '#102A43',
  teal: '#0F766E',
  tealDark: '#075E59',
  tealLight: '#E6F6F3',
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  muted: '#3F5A6E',
  line: '#D9E2EC',
  lineSoft: '#E3ECF2',
  error: '#E53935',
  danger: '#DC2626',
  gold: '#D97706',
  green: '#059669',
  orange: '#F59E0B',
  // telemetry / HUD accents for anti-slop + industrial brutalist unification
  hudGrid: 'rgba(15, 118, 110, 0.06)',
  hudBorder: '#CBE7E1',
  accentAmber: '#D97706',
  accentBlue: '#2563EB',
  surfaceSunken: '#FBFDFE',
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
} as const;

export const appFonts = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} as const;

// Anti-slop token scale — inherits existing visual world, expands system for Stage 1 compliance
export const radii = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 22,
  '3xl': 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
} as const;

export const shadows = {
  card: {
    boxShadow: '0 6px 14px rgba(16,42,67,0.06)',
    elevation: 3,
  },
  cardStrong: {
    boxShadow: '0 8px 16px rgba(16,42,67,0.08)',
    elevation: 4,
  },
  hud: {
    boxShadow: '0 12px 32px rgba(16,42,67,0.08)',
    elevation: 6,
  },
} as const;

// Telemetry mono for industrial brutalist HUD numbers — use only for actual data
export const monoStack = 'monospace' as const;

export type Colors = typeof colors;
export type Fonts = typeof fonts;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
