/**
 * RecoverOS design tokens. All UI colour, spacing, radius and type values come from
 * here — components never hard-code colours.
 */
export const palette = {
  teal700: '#0B5C53',
  teal600: '#0D6E63',
  teal500: '#168B7B',
  teal100: '#DDF1EE',
  teal50: '#EEF8F6',
  navy: '#16324F',
  ink: '#18212F',
  slate: '#697586',
  slate300: '#A9B3C1',
  border: '#E5EAF0',
  background: '#F5F8FA',
  white: '#FFFFFF',
  success: '#16865D',
  successSoft: '#E3F4EC',
  warning: '#D99428',
  warningSoft: '#FCF1DF',
  danger: '#C83D4B',
  dangerSoft: '#FBE7E9',
  info: '#2F6FB0',
  infoSoft: '#E5EFF9',
};

export interface ColorScheme {
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  secondary: string;
  navy: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  border: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  skeleton: string;
  overlay: string;
}

export const lightColors: ColorScheme = {
  primary: palette.teal600,
  primaryPressed: palette.teal700,
  primarySoft: palette.teal50,
  secondary: palette.teal500,
  navy: palette.navy,
  background: palette.background,
  surface: palette.white,
  surfaceMuted: '#F0F4F7',
  text: palette.ink,
  textSecondary: palette.slate,
  textMuted: palette.slate300,
  textOnPrimary: palette.white,
  border: palette.border,
  success: palette.success,
  successSoft: palette.successSoft,
  warning: palette.warning,
  warningSoft: palette.warningSoft,
  danger: palette.danger,
  dangerSoft: palette.dangerSoft,
  info: palette.info,
  infoSoft: palette.infoSoft,
  skeleton: '#E8EDF2',
  overlay: 'rgba(22, 50, 79, 0.45)',
};

export const darkColors: ColorScheme = {
  primary: '#2BB3A0',
  primaryPressed: '#219685',
  primarySoft: '#123A36',
  secondary: '#3FC2AF',
  navy: '#C9D7E6',
  background: '#0E1621',
  surface: '#16212F',
  surfaceMuted: '#1C2938',
  text: '#ECF1F6',
  textSecondary: '#9AA8B8',
  textMuted: '#6B7A8C',
  textOnPrimary: '#06201C',
  border: '#263445',
  success: '#3CC48C',
  successSoft: '#13362A',
  warning: '#F0B357',
  warningSoft: '#3A2D16',
  danger: '#F06B78',
  dangerSoft: '#3E1C22',
  info: '#6EA8E6',
  infoSoft: '#172C44',
  skeleton: '#223042',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.8 },
};
export type TypographyVariant = keyof typeof typography;

/** Minimum accessible touch target (Android guidance: 48dp). */
export const TOUCH_TARGET = 48;

export const shadow = {
  card: { shadowColor: '#16324F', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  raised: { shadowColor: '#16324F', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
};
