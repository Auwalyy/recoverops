import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, shadow, spacing, typography, type ColorScheme } from './tokens';
import { usePreferences } from '@/store/preferences';

export interface Theme {
  dark: boolean;
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = usePreferences((s) => s.themeMode);
  const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const theme = useMemo<Theme>(() => ({ dark, colors: dark ? darkColors : lightColors, spacing, radius, typography, shadow }), [dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  // Tests/components rendered outside the provider fall back to the light theme.
  return t ?? { dark: false, colors: lightColors, spacing, radius, typography, shadow };
}
