import { Platform, type TextStyle } from 'react-native';

/**
 * iOS design language. The app keeps its brand green as the accent/tint, but every
 * surface, separator, and label colour follows iOS system conventions: a grouped
 * background with white inset cards, hairline separators, and SF system type.
 *
 * Token names are intentionally stable (bg / surface / ink / muted …) so screens
 * keep working; the values underneath are the iOS palette. Light mode only for now
 * (values are picked to be easy to fork into a dark theme later).
 */
export const colors = {
  // Surfaces
  bg: '#f2f2f7', // systemGroupedBackground
  surface: '#ffffff', // secondarySystemGroupedBackground (inset cards)
  surfaceAlt: '#f2f2f7', // nested / inset wells inside a card
  fill: '#eef0f3', // tertiary fill — search fields, segmented track
  fillStrong: '#e3e3e8', // secondary fill

  // Text — iOS label hierarchy (opaque approximations)
  ink: '#1c1c1e', // label
  muted: '#6c6c70', // secondaryLabel
  faint: '#aeaeb2', // tertiaryLabel / placeholders

  // Hairlines
  line: '#e5e5ea', // separator
  lineStrong: '#d1d1d6', // opaque separator

  // Brand accent (green) — tint for buttons, links, progress, selection
  leaf: '#2f6f45',
  leafDark: '#1f5533',
  mint: '#e4f0e7',

  // Semantic accents
  saffron: '#b36b00',
  saffronBg: '#fff5df',
  saffronLine: '#f1d08a',
  sky: '#2b6f9f',
  skyBg: '#e7f2f9',
  rose: '#d70015', // systemRed
  disabled: '#c7c7cc', // systemGray3
};

export const radius = {
  sm: 8,
  md: 12, // inset cards, inputs, filled buttons
  lg: 16,
  pill: 999,
};

/** iOS grouped lists are flat; this soft shadow is only for floating elements (FAB). */
export const shadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 5,
};

/** Standard horizontal margin for grouped content (matches iOS inset lists). */
export const spacing = {
  screen: 16,
  gutter: 16,
};

/** The platform system font (San Francisco on iOS). */
export const systemFont = Platform.select({ ios: undefined, default: 'System' as const });

/**
 * iOS type ramp. `as const` keeps fontWeight as literal strings so these satisfy
 * TextStyle. Spread onto a Text style: `style={[type.headline, { color: ... }]}`.
 */
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
