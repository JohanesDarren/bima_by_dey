/**
 * Global color palette — "Dapur Sorgum Ceria" warm orange theme.
 * Mirrors the web-version's warm orange gradient identity.
 */
export const colors = {
  // Primary warm oranges
  primary: '#E8732A',
  primaryDark: '#C25A1D',
  primaryLight: '#F5A25D',
  gradient: ['#F7A34B', '#E8732A', '#C25A1D'] as const,

  // Backgrounds
  background: '#FFF6EC',
  surface: '#FFFFFF',
  surfaceAlt: '#FBEFE2',
  surfaceDark: '#2B211A',

  // Text
  text: '#2B211A',
  textMuted: '#8A7A6C',
  textOnPrimary: '#FFFFFF',
  textInverse: '#FDF6EF',

  // Semantics
  success: '#4C9B62',
  danger: '#C0392B',
  warning: '#E8A33D',
  info: '#3B82C4',

  // Reasoning panel (matches web "Proses Meracik Resep" panel)
  reasoningBg: '#FDF3E7',
  reasoningBorder: '#EED9BE',
  reasoningText: '#6B5A45',

  // Borders & misc
  border: '#EFE0CE',
  borderStrong: '#E2CDB2',
  overlay: 'rgba(43, 33, 26, 0.55)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 22 },
  bodySm: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
} as const;
