import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { password } from '@recoveros/shared';
import { Banner, Button, Card, FormField, Header, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { api, errorMessage } from '@/services/api/client';

interface InvitationInfo {
  type: 'STAFF' | 'PATIENT' | 'CAREGIVER';
  hospitalName?: string;
  firstName?: string;
  lastName?: string;
  hasExistingAccount: boolean;
}

const codeSchema = z.object({ token: z.string().trim().min(20, 'Enter the full activation code from your SMS or email') });
const passwordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

/**
 * Account activation via a one-time invitation code delivered by SMS/email. The code
 * proves possession of the phone/email (verification) and links the account to the
 * hospital relationship (staff role, patient record or caregiver consent).
 */
export default function Activate() {
  const { spacing } = useTheme();
  const accept = useAuth((s) => s.acceptInvitation);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { token: '' } });
  const pwForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } });

  const lookup = codeForm.handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await api<{ invitation: InvitationInfo }>('/auth/invitations/lookup', { method: 'POST', auth: false, body: { token: v.token } });
      setToken(v.token);
      setInfo(r.invitation);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const activate = pwForm.handleSubmit(async (v) => {
    setError(null);
    try {
      await accept({ token, password: v.password });
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const roleLabel = info?.type === 'STAFF' ? 'a staff member' : info?.type === 'CAREGIVER' ? 'a caregiver' : 'a patient';

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <Header back title="Activate your account" subtitle="Use the code your hospital sent you by SMS or email." />
      {error ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" title="We couldn't continue" message={error} />
        </View>
      ) : null}
      {!info ? (
        <>
          <FormField control={codeForm.control} name="token" label="Activation code" icon="key-outline" autoCapitalize="none" autoCorrect={false} hint="The code is case-sensitive." />
          <Button title="Continue" onPress={() => void lookup()} loading={codeForm.formState.isSubmitting} />
        </>
      ) : (
        <>
          <Card tone="muted" style={{ marginBottom: spacing.xl }}>
            <Text variant="overline" tone="secondary">
              Invitation
            </Text>
            <Text variant="heading" style={{ marginTop: 4 }}>
              {info.firstName ? `Welcome, ${info.firstName}` : 'Welcome'}
            </Text>
            <Text variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
              {info.hospitalName ?? 'Your hospital'} invited you to RecoverOS as {roleLabel}.
            </Text>
          </Card>
          <FormField control={pwForm.control} name="password" label={info.hasExistingAccount ? 'Your existing RecoverOS password' : 'Create a password'} secure icon="lock-closed-outline" hint={info.hasExistingAccount ? 'You already have an account — confirm it to link this invitation.' : 'At least 10 characters with letters and numbers.'} />
          <FormField control={pwForm.control} name="confirm" label="Confirm password" secure icon="lock-closed-outline" />
          <Button title="Activate account" onPress={() => void activate()} loading={pwForm.formState.isSubmitting} />
        </>
      )}
    </Screen>
  );
}
