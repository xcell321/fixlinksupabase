import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Platform } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

// -----------------------------------------------------------------------------
// FIXLINK THEME — one palette, the original one.
// These values are the FixLink brand palette. Keep them as they are: screens
// import `colors` directly into their (module-level) style maps, so a value
// changed here changes every screen at once.
// -----------------------------------------------------------------------------

export const colors = {
  ink: '#102A43',
  // Strongest text. Deliberately a different value from `dark` so the two stay
  // distinguishable if a surface token is ever re-derived from a literal.
  inkStrong: '#0A1C2E',
  dark: '#0D1B2A',

  // Role accents: customer orange, technician blue.
  customer: '#F97316',
  customerDark: '#EA580C',
  customerSoft: '#FFF7ED',
  customerMist: '#FFEDD5',

  tech: '#2563EB',
  techDark: '#1D4ED8',
  techSoft: '#EFF6FF',
  techMist: '#DBEAFE',

  appBg: '#F9FAFB',
  canvas: '#F5F8FA',
  white: '#FFFFFF',
  elevated: '#FFFFFF',
  surfaceSunken: '#FBFDFE',
  cardBorder: '#F3F4F6',
  line: '#D9E2EC',
  lineSoft: '#E3ECF2',
  edge: 'rgba(16,42,67,0.06)',

  // Text hierarchy on light surfaces. `subtle` is the placeholder / quiet-icon
  // grey the screens were designed around.
  muted: '#3F5A6E',
  subtle: '#9CA3AF',
  // Foreground that sits ON a role-accent fill (never a surface).
  onAccent: '#FFFFFF',

  teal: '#0F766E',
  tealDark: '#075E59',
  tealLight: '#E6F6F3',

  error: '#E53935',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',

  gold: '#D97706',
  orange: '#F59E0B',
  lamp: '#D97706',

  green: '#059669',
  successSoft: '#ECFDF5',
  successBorder: '#A7F3D0',
  successText: '#047857',

  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningText: '#92400E',

  // Telemetry / HUD accents for the anti-slop + industrial brutalist systems.
  hudGrid: 'rgba(15, 118, 110, 0.06)',
  hudBorder: '#CBE7E1',
  accentAmber: '#D97706',
  accentBlue: '#2563EB',
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

// Anti-slop token scale.
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

// Shadows use the single cross-platform `boxShadow` primitive (supported on
// web, iOS, and Android through the New Architecture). Android's `elevation`
// is deliberately NOT set next to boxShadow: the two stack, so Android drew a
// second, wider Material shadow that made every card look hazier and softer
// than the same card on web and iOS. One primitive keeps all three identical.
export const shadows = {
  subtle: {
    boxShadow: '0 2px 8px rgba(16,42,67,0.06)',
  },
  card: {
    boxShadow: '0 6px 14px rgba(16,42,67,0.06)',
  },
  cardStrong: {
    boxShadow: '0 8px 16px rgba(16,42,67,0.08)',
  },
  hud: {
    boxShadow: '0 12px 32px rgba(16,42,67,0.08)',
  },
} as const;

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

// Style maps are plain objects. This stays as the one entry point screens use so
// the literal types survive (e.g. alignItems: 'center'), which is what the React
// Native style props accept.
export function themedStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  raw: T & NamedStyles<unknown>,
): T {
  // Android pads every text block with extra leading (`includeFontPadding`),
  // which shifts baselines so the same label sits lower and looser on Android
  // than on web and iOS. Clearing it in this one place keeps text metrics
  // identical on all three platforms. Only text styles are touched.
  if (Platform.OS === 'android') {
    const stylesRecord = raw as unknown as Record<string, TextStyle | undefined>;
    for (const key of Object.keys(stylesRecord)) {
      const style = stylesRecord[key];
      if (style && (style.fontSize != null || style.fontFamily != null)) {
        style.includeFontPadding = false;
      }
    }
  }
  return raw;
}

// Telemetry mono for industrial brutalist HUD numbers — use only for actual data
export const monoStack = 'monospace' as const;

export type Colors = typeof colors;
export type ThemeColors = Colors;
export type ThemeShadows = typeof shadows;
export type Fonts = typeof fonts;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
