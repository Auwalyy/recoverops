import { Button, EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/store/auth';

/** Signed in, but no active hospital relationship (e.g. access revoked or expired). */
export default function NoAccess() {
  const logout = useAuth((s) => s.logout);
  return (
    <Screen edges={['top', 'bottom']}>
      <EmptyState
        icon="lock-closed-outline"
        title="No active access"
        message="Your account is not currently linked to a hospital recovery programme. If you think this is a mistake, contact your hospital."
      />
      <Button title="Sign out" variant="outline" onPress={() => void logout()} />
    </Screen>
  );
}
