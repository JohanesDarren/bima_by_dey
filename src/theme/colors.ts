/**
 * Global color palette — "sorgumcore" green/cream theme.
 * Transitioning to a Flutter-like Material aesthetic.
 */
export const colors = {
  // Primary greens
  primary: '#2E7D32', // Dark Green
  primaryDark: '#1B5E20',
  primaryLight: '#A5D6A7', // Soft Green
  gradient: ['#A5D6A7', '#4CAF50', '#2E7D32'] as const,

  // Backgrounds (Cream)
  background: '#FDFBF7', // Cream
  surface: '#FFFFFF',
  surfaceAlt: '#F5F2EA',
  surfaceDark: '#1A2E1C',

  // Text
  text: '#1F2A21',
  textMuted: '#6B7A6E',
  textOnPrimary: '#FFFFFF',
  textInverse: '#FDFBF7',

  // Semantics
  success: '#4C9B62',
  danger: '#C0392B',
  warning: '#E8A33D',
  info: '#3B82C4',

  // Reasoning panel
  reasoningBg: '#F3F8F4',
  reasoningBorder: '#C8E6C9',
  reasoningText: '#385C3A',

  // Borders & misc
  border: '#E3E0D8',
  borderStrong: '#C5C2BA',
  overlay: 'rgba(31, 42, 33, 0.55)',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const elevation = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 1.0, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.23, shadowRadius: 2.62, elevation: 4 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 4.65, elevation: 8 },
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
