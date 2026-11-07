import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Header, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { api, errorMessage } from '@/services/api/client';
import { useAuth } from '@/store/auth';

/** One-time-code verification of the signed-in user's phone (SMS) or email. */
export default function Verify() {
  const { colors, radius, spacing, typography } = useTheme();
  const params = useLocalSearchParams<{ channel?: 'SMS' | 'EMAIL' }>();
  const channel = params.channel === 'EMAIL' ? 'EMAIL' : 'SMS';
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const refreshMe = useAuth((s) => s.refreshMe);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/verification/request', { method: 'POST', body: { channel } });
      setSent(true);
      setTimeout(() => input.current?.focus(), 200);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/verification/confirm', { method: 'POST', body: { channel, code } });
      await refreshMe();
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboard edges={['top', 'bottom']}>
      <Header back title={channel === 'SMS' ? 'Verify your phone' : 'Verify your email'} subtitle="We'll send a 6-digit code. It expires in 10 minutes." />
      {error ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" title="Verification failed" message={error} />
        </View>
      ) : null}
      {done ? (
        <>
          <Banner tone="success" title="Verified" message="Thank you — your contact details are confirmed." />
          <Button title="Done" style={{ marginTop: spacing.xl }} onPress={() => router.back()} />
        </>
      ) : !sent ? (
        <Button title="Send code" onPress={send} loading={busy} />
      ) : (
        <>
          <Pressable accessibilityLabel="Enter the 6-digit code" onPress={() => input.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={{ width: 46, height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: code.length === i ? colors.primary : colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="title">{code[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={input}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={6}
            style={[typography.body, { position: 'absolute', opacity: 0, height: 1, width: 1 }]}
          />
          <Button title="Verify" onPress={confirm} loading={busy} disabled={code.length !== 6} />
          <Button title="Resend code" variant="ghost" onPress={send} style={{ marginTop: spacing.sm }} />
        </>
      )}
    </Screen>
  );
}
