import { Platform, type TextStyle } from 'react-native';

/**
 * Vital Dark design language. All surfaces, separators, and label colours follow the
 * dark palette introduced in the Vital Dark Home redesign. Token names are kept stable
 * so every screen continues to work; only the values underneath changed.
 */
export const colors = {
  // Surfaces
  bg: '#0a0a0d',
  surface: 'rgba(255,255,255,0.045)' as string,     // card background
  surfaceAlt: 'rgba(255,255,255,0.03)' as string,   // nested wells
  fill: 'rgba(255,255,255,0.06)' as string,         // search fields, segmented track
  fillStrong: 'rgba(255,255,255,0.09)' as string,   // stepper bg, pressed state

  // Text
  ink: '#f2f2f4',
  muted: 'rgba(235,235,245,0.55)' as string,
  faint: 'rgba(235,235,245,0.35)' as string,        // placeholders

  // Borders / hairlines
  line: 'rgba(255,255,255,0.07)' as string,         // card border, row divider
  lineStrong: 'rgba(255,255,255,0.12)' as string,   // stepper separator

  // Brand accent — amber
  leaf: '#ffb454',
  leafDark: '#ffd08a',
  mint: 'rgba(255,180,84,0.12)' as string,

  // Warning / over-target — amber
  saffron: '#ffb454',
  saffronBg: 'rgba(255,170,70,0.12)' as string,
  saffronLine: 'rgba(255,170,70,0.30)' as string,

  // Info — cyan
  sky: '#3bc9ff',
  skyBg: 'rgba(59,201,255,0.12)' as string,

  // Error
  rose: '#ff6b6b',

  // Disabled
  disabled: 'rgba(255,255,255,0.18)' as string,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const shadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 8,
};

export const spacing = {
  screen: 16,
  gutter: 16,
};

export const systemFont = Platform.select({ ios: undefined, default: 'System' as const });

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, fontWeight: '700' },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  callout: { fontSize: 16, fontWeight: '400' },
  subhead: { fontSize: 15, fontWeight: '400' },
  footnote: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

export function clampPercent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

/**
 * Dark ("Vital") theme — extended tokens used by the home screen and available
 * for any component that needs accent-colour variants beyond the base palette.
 */
export const dark = {
  bg: colors.bg,
  card: colors.surface,
  border: colors.line,
  divider: 'rgba(255,255,255,0.05)' as string,
  trackBg: colors.fill,
  ink: colors.ink,
  muted: colors.muted,
  label: 'rgba(235,235,245,0.42)' as string,
  accent: '#ffb454',
  accent2: '#ffd08a',
  cyan: '#2bb8f0',
  cyan2: '#74e0ff',
  green: '#22c98a',
  green2: '#6cf0bb',
  red: '#ff5f56',
  red2: '#ff8f88',
  yellow: '#ffd23f',
  yellow2: '#ffe58a',
  orange: '#ff7a4d',
  orange2: '#ffb454',
  amber: '#ffb454',
  amber2: '#ffd08a',
  glow: 'rgba(255,180,84,0.18)' as string,
};
