import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH_TARGET } from '@/theme/tokens';
import { Text } from './Text';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'primary' | 'muted' | 'danger' | 'warning';
  accessibilityLabel?: string;
}

export function Card({ children, onPress, style, tone = 'default', accessibilityLabel }: CardProps) {
  const { colors, radius, spacing, shadow } = useTheme();
  const bg = { default: colors.surface, primary: colors.primary, muted: colors.surfaceMuted, danger: colors.dangerSoft, warning: colors.warningSoft }[tone];
  const base: ViewStyle = {
    backgroundColor: bg,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: tone === 'default' ? StyleSheet.hairlineWidth : 0,
    borderColor: colors.border,
    ...(tone === 'default' ? shadow.card : null),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBg?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  accessibilityHint?: string;
}

/** Standard list row: icon tile, title/subtitle, trailing element. */
export function ListRow({ title, subtitle, icon, iconColor, iconBg, right, onPress, chevron = !!onPress, accessibilityHint }: ListRowProps) {
  const { colors, spacing, radius } = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_TARGET + 8, paddingVertical: spacing.sm }}>
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: iconBg ?? colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
          <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="subheading" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: spacing.sm }} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} accessibilityHint={accessibilityHint} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}
