import { Redirect } from 'expo-router';
import { useAuth } from '@/store/auth';
import { usePreferences } from '@/store/preferences';
import { SplashView } from '@/screens/auth/SplashView';

/**
 * Entry router. Nothing patient-related renders until authentication (and the server's
 * resolution of the user's relationships) completes.
 */
export default function Index() {
  const status = useAuth((s) => s.status);
  const actingAs = useAuth((s) => s.actingAs);
  const onboardingSeen = usePreferences((s) => s.onboardingSeen);

  if (status === 'loading') return <SplashView />;
  if (status === 'signedOut') return <Redirect href={onboardingSeen ? '/(auth)/login' : '/(auth)/onboarding'} />;
  if (actingAs === 'STAFF') return <Redirect href="/(staff)" />;
  if (actingAs === 'CAREGIVER') return <Redirect href="/(caregiver)" />;
  if (actingAs === 'PATIENT') return <Redirect href="/(patient)" />;
  return <Redirect href="/(auth)/no-access" />;
}
