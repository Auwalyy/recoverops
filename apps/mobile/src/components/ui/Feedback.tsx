import { useEffect, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';
import { Button } from './Button';

/** Subtle pulsing skeleton block. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity]);
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }, anim, style]} />;
}

/** Skeleton for list/card screens while data loads. */
export function LoadingCards({ count = 3 }: { count?: number }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View accessibilityLabel="Loading" accessible style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
          <Skeleton width="45%" height={14} />
          <Skeleton width="85%" height={18} />
          <Skeleton width="60%" height={14} />
        </View>
      ))}
    </View>
  );
}

interface StateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
}

/** Calm, illustrated empty state. */
export function EmptyState({ icon = 'leaf-outline', title, message, action }: StateProps) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xl }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={colors.primary} />
        </View>
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="bodySmall" tone="secondary" align="center" style={{ marginTop: spacing.xs, maxWidth: 300 }}>
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} variant="secondary" fullWidth={false} onPress={action.onPress} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

/** Meaningful error with retry. */
export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xl }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
        <Ionicons name="cloud-offline-outline" size={30} color={colors.danger} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="bodySmall" tone="secondary" align="center" style={{ marginTop: spacing.xs, maxWidth: 300 }}>
          {message}
        </Text>
      ) : null}
      {onRetry ? <Button title="Try again" icon="refresh" variant="outline" fullWidth={false} onPress={onRetry} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export function Banner({ tone = 'info', title, message, icon, children }: { tone?: BannerTone; title: string; message?: string; icon?: keyof typeof Ionicons.glyphMap; children?: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const map = {
    info: { bg: colors.infoSoft, fg: colors.info, icon: 'information-circle' as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-circle' as const },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'warning' as const },
    success: { bg: colors.successSoft, fg: colors.success, icon: 'checkmark-circle' as const },
  }[tone];
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : 'summary'} style={{ backgroundColor: map.bg, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', gap: spacing.md }}>
      <Ionicons name={icon ?? map.icon} size={22} color={map.fg} />
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        {message ? (
          <Text variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
            {message}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors, radius } = useTheme();
  const map = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
    primary: { bg: colors.primarySoft, fg: colors.primary },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    info: { bg: colors.infoSoft, fg: colors.info },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: map.bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }}>
      {icon ? <Ionicons name={icon} size={12} color={map.fg} /> : null}
      <Text variant="caption" style={{ color: map.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, tone = 'primary', height = 8 }: { value: number; tone?: 'primary' | 'success' | 'warning'; height?: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(pct, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [pct, width]);
  const anim = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  const fill = { primary: colors.primary, success: colors.success, warning: colors.warning }[tone];
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }} style={{ height, borderRadius: height, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: fill }, anim]} />
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <View accessibilityElementsHidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="label" tone="primary" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}
