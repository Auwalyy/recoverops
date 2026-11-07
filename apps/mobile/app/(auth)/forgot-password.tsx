import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { password } from '@recoveros/shared';
import { Banner, Button, FormField, Header, Screen } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { api, errorMessage } from '@/services/api/client';

const requestSchema = z.object({ identifier: z.string().trim().min(3, 'Enter your email or phone number') });
const resetSchema = z.object({ token: z.string().trim().min(20, 'Enter the full reset code'), password });

export default function ForgotPassword() {
  const { spacing } = useTheme();
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [error, setError] = useState<string | null>(null);
  const req = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { identifier: '' } });
  const reset = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { token: '', password: '' } });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <Header back title="Reset password" subtitle={step === 'request' ? "We'll send a reset code to your email or phone." : 'Enter the code you received and a new password.'} />
      {error ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" title="Something went wrong" message={error} />
        </View>
      ) : null}
      {step === 'request' ? (
        <>
          <FormField control={req.control} name="identifier" label="Email or phone number" autoCapitalize="none" icon="person-outline" />
          <Button
            title="Send reset code"
            loading={req.formState.isSubmitting}
            onPress={() => void req.handleSubmit(async (v) => {
              setError(null);
              try {
                await api('/auth/forgot-password', { method: 'POST', auth: false, body: v });
                setStep('reset');
              } catch (e) {
                setError(errorMessage(e));
              }
            })()}
          />
        </>
      ) : step === 'reset' ? (
        <>
          <View style={{ marginBottom: spacing.lg }}>
            <Banner tone="info" title="Check your messages" message="If an account exists for these details, a reset code has been sent. It expires in 30 minutes." />
          </View>
          <FormField control={reset.control} name="token" label="Reset code" autoCapitalize="none" icon="key-outline" />
          <FormField control={reset.control} name="password" label="New password" secure icon="lock-closed-outline" hint="At least 10 characters with letters and numbers." />
          <Button
            title="Update password"
            loading={reset.formState.isSubmitting}
            onPress={() => void reset.handleSubmit(async (v) => {
              setError(null);
              try {
                await api('/auth/reset-password', { method: 'POST', auth: false, body: v });
                setStep('done');
              } catch (e) {
                setError(errorMessage(e));
              }
            })()}
          />
        </>
      ) : (
        <>
          <Banner tone="success" title="Password updated" message="For your security, you have been signed out on all devices. Sign in with your new password." />
          <Button title="Back to sign in" style={{ marginTop: spacing.xl }} onPress={() => router.replace('/(auth)/login')} />
        </>
      )}
    </Screen>
  );
}
