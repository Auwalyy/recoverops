import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { useAuth, type Experience } from '@/store/auth';
import { SplashView } from '@/screens/auth/SplashView';

/**
 * Route-group guard: renders children only for a signed-in user acting in the expected
 * experience. This is a UX guard; every request is still authorised by the backend.
 */
export function RequireExperience({ experience, children }: { experience: Experience; children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const actingAs = useAuth((s) => s.actingAs);
  if (status === 'loading') return <SplashView />;
  if (status !== 'signedIn') return <Redirect href="/(auth)/login" />;
  if (actingAs !== experience) return <Redirect href="/" />;
  return <>{children}</>;
}
