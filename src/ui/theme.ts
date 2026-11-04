import { Platform, type TextStyle } from 'react-native';

/**
 * True Black Vivid design language: pure black base, solid #1c1c1e inset cards, blue
 * for every interactive element, orange for calories, and a fixed colour per macro.
 * Token names are kept stable so every screen keeps working; the values underneath
 * changed. The neon macro colours are for labels, bars and small accents only — never
 * body text.
 */
export const colors = {
  // Surfaces
  bg: '#000000',
  surface: '#1c1c1e',        // card background
  surfaceAlt: '#1c1c1e',     // nested wells
  fill: '#2c2c2e',           // inner fill, tracks, pressed rows
  fillStrong: '#2c2c2e',     // stepper bg

  // Text
  ink: '#ffffff',
  muted: '#8e8e93',
  faint: '#48484a',          // chevrons, decorative only
  placeholder: '#636366',    // input placeholders — readable, but clearly not a value

  // Borders / hairlines
  line: '#38383a',           // hairline row separator
  lineStrong: '#636366',     // stepper divider, target line

  // Action — blue
  leaf: '#0a84ff',
  leafDark: '#0a84ff',       // tint text
  mint: '#0a2a4d',           // tint background

  // Plan / warning — orange
  saffron: '#ff6a1a',
  saffronBg: 'rgba(255,106,26,0.16)' as string,
  saffronLine: 'rgba(255,106,26,0.30)' as string,

  // Error / destructive
  rose: '#ff453a',

  // Disabled
  disabled: 'rgba(255,255,255,0.18)' as string,

  // Energy (calories)
  energy: '#ff6a1a',
  energyTrack: '#3a1d0c',

  // Macros
  protein: '#fa2d5a',
  carbs: '#b4f000',
  fat: '#00d8e8',
  fibre: '#ad6af6', // 5.0:1 on cards (was #a55cf5, 4.4:1 — under AA for small labels)

  // Status
  good: '#30d158',           // on target, backed up, body metrics
  over: '#ff453a',

  // Controls
  separator: '#38383a',
  segmentOn: '#636366',
  chevron: '#48484a',
  switchOff: '#39393d',

  // Calorie trend bars: within ±100 kcal of target = solid status green, more than 100
  // over = solid status red, more than 100 under = this dim fill drawn with a green
  // outline (a different shape, so it never depends on telling two greens apart).
  trendOn: '#30d158',
  trendOver: '#ff453a',
  trendUnder: 'rgba(48,209,88,0.22)' as string,

  // Favourites
  star: '#ffd60a',

  // Planned entries
  plannedRow: 'rgba(255,106,26,0.08)' as string,
  plannedPillBg: 'rgba(255,106,26,0.16)' as string,
  plannedPillText: '#ff8a4a',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const spacing = {
  screen: 16,
  gutter: 16,
};

export const systemFont = Platform.select({ ios: undefined, default: 'System' as const });

/** Rounded system face for large numbers (SF Rounded on Apple web; plain System elsewhere). */
export const roundedFont = Platform.select({
  web: 'ui-rounded, -apple-system, system-ui, sans-serif',
  default: undefined,
});

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.37, lineHeight: 41 },
  title1: { fontSize: 28, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, fontWeight: '600' },
  headline: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 17, fontWeight: '400' },
  callout: { fontSize: 16, fontWeight: '400' },
  subhead: { fontSize: 15, fontWeight: '400' },
  footnote: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

/** A big rounded number (hero kcal, macro values, trend values). */
export function heroNumber(fontSize: number, fontWeight: TextStyle['fontWeight'] = '600'): TextStyle {
  return {
    fontFamily: roundedFont,
    fontSize,
    fontWeight,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  };
}

export function clampPercent(value: number): `${number}%` {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}
