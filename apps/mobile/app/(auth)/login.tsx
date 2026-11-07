import { useState } from 'react';
import { Image, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Banner, Button, FormField, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api/client';

export const loginFormSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number'),
  password: z.string().min(1, 'Enter your password'),
});
type LoginForm = z.infer<typeof loginFormSchema>;

export default function Login() {
  const { colors, spacing, radius } = useTheme();
  const login = useAuth((s) => s.login);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<LoginForm>({ resolver: zodResolver(loginFormSchema), defaultValues: { identifier: '', password: '' } });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await login(v.identifier, v.password);
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', marginTop: spacing.xxxl, marginBottom: spacing.xxxl }}>
        <View style={{ width: 72, height: 72, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
          <Image source={require('../../assets/splash-icon.png')} style={{ width: 52, height: 52 }} accessibilityIgnoresInvertColors />
        </View>
        <Text variant="display">Welcome back</Text>
        <Text variant="body" tone="secondary" align="center" style={{ marginTop: spacing.xs }}>
          Sign in to continue your recovery journey.
        </Text>
      </View>

      {error ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" title="Could not sign in" message={error} />
        </View>
      ) : null}

      <FormField control={control} name="identifier" label="Email or phone number" icon="person-outline" autoCapitalize="none" autoComplete="username" keyboardType="email-address" textContentType="username" returnKeyType="next" placeholder="e.g. +2348012345678" />
      <FormField control={control} name="password" label="Password" icon="lock-closed-outline" secure autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void onSubmit()} />

      <Button title="Sign in" onPress={() => void onSubmit()} loading={formState.isSubmitting} />

      <View style={{ alignItems: 'center', marginTop: spacing.lg, gap: spacing.sm }}>
        <Link href="/(auth)/forgot-password" asChild>
          <Button title="Forgot password?" variant="ghost" size="md" fullWidth={false} />
        </Link>
      </View>

      <View style={{ marginTop: 'auto', paddingTop: spacing.xxxl, alignItems: 'center' }}>
        <Text variant="bodySmall" tone="secondary">
          Received an activation code from your hospital?
        </Text>
        <Link href="/(auth)/activate" asChild>
          <Button title="Activate my account" variant="secondary" style={{ marginTop: spacing.sm }} />
        </Link>
      </View>
    </Screen>
  );
}
