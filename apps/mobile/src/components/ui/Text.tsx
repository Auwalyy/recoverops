import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'danger' | 'success' | 'warning' | 'inverse';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const color = {
    default: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    primary: colors.primary,
    danger: colors.danger,
    success: colors.success,
    warning: colors.warning,
    inverse: colors.textOnPrimary,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      style={[typography[variant], { color, textAlign: align }, variant === 'overline' && { textTransform: 'uppercase' }, style]}
      {...rest}
    />
  );
}
