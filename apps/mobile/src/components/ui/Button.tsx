import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH_TARGET } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  size?: 'md' | 'lg' | 'sm';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, variant = 'primary', icon, loading, size = 'lg', fullWidth = true, disabled, style, onPress, ...rest }: ButtonProps) {
  const { colors, radius } = useTheme();
  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.textOnPrimary, border: colors.primary },
    secondary: { bg: colors.primarySoft, pressed: colors.border, fg: colors.primary, border: colors.primarySoft },
    outline: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, pressed: colors.danger, fg: '#FFFFFF', border: colors.danger },
  }[variant];
  const height = size === 'lg' ? 52 : size === 'md' ? TOUCH_TARGET : 40;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          minHeight: size === 'sm' ? 40 : TOUCH_TARGET,
          borderRadius: radius.md,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: size === 'sm' ? 12 : 20,
          opacity: isDisabled ? 0.55 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={palette.fg} style={{ marginRight: 8 }} /> : null}
          <Text variant={size === 'sm' ? 'caption' : 'label'} style={{ color: palette.fg, fontSize: size === 'sm' ? 13 : 16 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
