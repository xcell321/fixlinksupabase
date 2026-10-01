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
  black: '#000000',
  elevated: '#FFFFFF',
  surfaceSunken: '#FBFDFE',
  cardBorder: '#F3F4F6',
  line: '#D9E2EC',
  lineSoft: '#E3ECF2',
  edge: 'rgba(16,42,67,0.06)',

  // Overlay layers: the dim behind a bottom sheet, and the deeper backdrop
  // behind a centered dialog. Shared so every modal dims identically.
  scrim: 'rgba(16, 42, 67, 0.4)',
  backdrop: 'rgba(13,27,42,0.5)',

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
  // Brighter sign-out red.
  dangerBright: '#EF4444',
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

  // Neutral gray ramp (Tailwind-compatible values) for text, borders, and
  // skeleton surfaces that predate the named tokens. Same values, one home.
  gray900: '#111827',
  gray700: '#374151',
  gray600: '#4B5563',
  gray500: '#6B7280',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate400: '#94A3B8',

  // Live-presence green for online dots.
  success: '#10B981',

  // Skill-badge tints (one pair per level).
  badgeBlueBorder: '#BFDBFE',
  badgeGreenBg: '#F0FDF4',
  badgeGreenBorder: '#BBF7D0',
  badgeAmberBg: '#FEF3C7',

  // One-off tints referenced by name so no screen carries a raw hex.
  // Values are exact; renaming never changes how anything looks.
  hairline: '#E6EAF0',
  steel: '#8AA0B5',
  steelDark: '#6B8A9A',
  stone: '#C7CDD6',
  frost: '#EDF2F7',
  blush: '#FFF5F5',
  tealWash: '#F0FDFA',
  tealTint: '#B5E7DE',
  brightBlue: '#3B82F6',

  // Dashboard tip card (warm aside).
  tipCream: '#FFF8E7',
  tipTitle: '#8A5B00',
  tipCopy: '#9A711E',

  // Status pills and icon chips.
  donePill: '#D1FAE5',
  chipBlue: '#EBF2FF',

  // Verification next-steps heading.
  deepBlue: '#1E40AF',

  // Signal violet for the Customer Ready hand-off.
  signalViolet: '#7C3AED',

  // Completed status green used by the status-color helper.
  statusComplete: '#16A34A',

  // Busy workload text on the amber fill.
  warningStrong: '#B45309',

  // Map and trip surfaces.
  mapBg: '#EEF2F5',
  tripSummaryBg: '#F4F8FA',
  collapseBtnBg: '#F0F4F8',
  // Customer-tracker trip metrics row.
  tripRowBg: '#F8FAFB',
  // "LocationIQ Maps" watermark text drawn over the map tiles.
  mapWatermark: '#486581',

  // Local skeleton default tint (SubmitRequest shimmer).
  skeletonTint: '#E1E6EB',
} as const;

// Builds an rgba() from one of the palette colours plus an opacity, so screens
// never carry a literal rgba() with hardcoded channels. The colour always comes
// from `colors` above; only the opacity is passed inline (like a size). Values
// are exactly the strings this replaced.
export const alpha = (hex: string, opacity: number): string => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
};

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
