import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { Language } from '@recoveros/shared';

/** Non-sensitive client preferences (persisted in SecureStore for simplicity). */
interface PreferencesState {
  language: Language;
  themeMode: 'system' | 'light' | 'dark';
  onboardingSeen: boolean;
  hydrated: boolean;
  setLanguage: (l: Language) => void;
  setThemeMode: (m: 'system' | 'light' | 'dark') => void;
  markOnboardingSeen: () => void;
  hydrate: () => Promise<void>;
}

const KEY = 'recoveros.preferences';

export const usePreferences = create<PreferencesState>((set, get) => {
  const persist = () => {
    const { language, themeMode, onboardingSeen } = get();
    void SecureStore.setItemAsync(KEY, JSON.stringify({ language, themeMode, onboardingSeen })).catch(() => undefined);
  };
  return {
    language: 'en',
    themeMode: 'system',
    onboardingSeen: false,
    hydrated: false,
    setLanguage: (language) => {
      set({ language });
      persist();
    },
    setThemeMode: (themeMode) => {
      set({ themeMode });
      persist();
    },
    markOnboardingSeen: () => {
      set({ onboardingSeen: true });
      persist();
    },
    hydrate: async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) set({ ...(JSON.parse(raw) as Partial<PreferencesState>) });
      } catch {
        /* first run */
      }
      set({ hydrated: true });
    },
  };
});
