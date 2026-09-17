/** sorgumcore “Terra” tokens — warm, editorial, food-first. */
export const colors = {
  primary: '#1F3323',
  primaryDark: '#17271B',
  primaryLight: '#DDE9DF',
  accent: '#C8963E',
  accentDark: '#9A6F26',
  clay: '#B95732',
  gradient: ['#1F3323', '#2D4633', '#4A7C59'] as const,

  background: '#FAF6F0',
  surface: '#FFFDF9',
  surfaceAlt: '#F0ECE4',
  surfaceDark: '#1F3323',
  surfaceDarkAlt: '#2A4230',

  text: '#2E3230',
  textMuted: '#687169',
  textSubtle: '#676D67',
  textOnPrimary: '#FAF6F0',
  textInverse: '#FAF6F0',

  success: '#4A7C59',
  danger: '#A84335',
  error: '#A84335',
  warning: '#B17B29',
  info: '#526D61',

  reasoningBg: '#EEF3ED',
  reasoningBorder: '#CAD9CC',
  reasoningText: '#38513E',

  border: '#E4E0D8',
  borderStrong: '#C9C2B7',
  overlay: 'rgba(23, 39, 27, 0.68)',
  white: '#FFFFFF',
  black: '#000000',
  disabled: '#A9ADA7',
} as const;

export const elevation = {
  sm: {
    shadowColor: '#1F3323',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  md: {
    shadowColor: '#1F3323',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1F3323',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

const display = { fontFamily: 'serif' } as const;
export const typography = {
  h1: { ...display, fontSize: 30, fontWeight: '700' as const, lineHeight: 36 },
  h2: { ...display, fontSize: 24, fontWeight: '700' as const, lineHeight: 30 },
  h3: { ...display, fontSize: 19, fontWeight: '700' as const, lineHeight: 25 },
  body: { fontSize: 16, lineHeight: 24 },
  bodySm: { fontSize: 14, lineHeight: 21 },
  caption: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '700' as const, lineHeight: 17, letterSpacing: 0.5 },
} as const;
