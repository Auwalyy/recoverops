import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SystemUI from 'expo-system-ui';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { onLogout, useAuth } from '@/store/auth';
import { usePreferences } from '@/store/preferences';
import { outbox } from '@/offline/sync';
import { offlineCache } from '@/offline/db';
import { ApiError } from '@/services/api/client';
import { useAppServices } from '@/hooks/useAppServices';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});

// Logout cleanup: no patient data may remain on the device after sign-out.
onLogout(() => queryClient.clear());
onLogout(() => outbox.clearAll().catch(() => undefined));
onLogout(() => offlineCache.clearAll().catch(() => undefined));

function AppServices() {
  useAppServices();
  return null;
}

function ThemedStack() {
  const { colors, dark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(patient)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(staff)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(caregiver)" options={{ animation: 'fade' }} />
      </Stack>
      <AppServices />
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void (async () => {
      await usePreferences.getState().hydrate();
      await useAuth.getState().bootstrap();
      setReady(true);
      await SplashScreen.hideAsync().catch(() => undefined);
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>{ready ? <ThemedStack /> : null}</ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
