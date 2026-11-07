import { createElement } from 'react';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';

/** Shared bottom-tab styling for every experience. */
export function useTabBarOptions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textSecondary,
    tabBarLabelStyle: { fontSize: 12, fontWeight: '600' as const, marginBottom: 2 },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      height: 62 + insets.bottom,
      paddingTop: 6,
      paddingBottom: Math.max(insets.bottom, 8),
    },
    sceneStyle: { backgroundColor: colors.background },
  };
}

/** Tab icon that switches between outline and filled glyphs when focused. */
export function tabIcon(name: keyof typeof Ionicons.glyphMap, active: keyof typeof Ionicons.glyphMap) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return createElement(Ionicons, { name: focused ? active : name, size: 24, color: color as string });
  };
}
