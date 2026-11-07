import { useState, type ReactNode } from 'react';
import { Alert, Linking, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LANGUAGE_LABELS, LANGUAGES, type Language } from '@recoveros/shared';
import { Avatar, Badge, Banner, Button, Card, ChoiceChips, EmptyState, ErrorState, Header, ListRow, LoadingCards, Row, Screen, Section, Text } from '@/components/ui';
import { EmergencyCard } from '@/components/patient';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth, type Experience } from '@/store/auth';
import { usePreferences } from '@/store/preferences';
import { careApi, careKeys, useHospitalInfo } from '@/features/care/api';
import { useSync } from '@/offline/sync';
import { outbox } from '@/offline/sync';
import { errorMessage } from '@/services/api/client';
import { formatDate, humanize, relativeTime } from '@/utils/format';

/** Profile with identity, context switching, preferences, sessions and sign-out. */
export function ProfileScreen({ prefix, children }: { prefix: '/(patient)' | '/(staff)' | '/(caregiver)'; children?: ReactNode }) {
  const { colors, spacing } = useTheme();
  const user = useAuth((s) => s.user);
  const actingAs = useAuth((s) => s.actingAs);
  const switchContext = useAuth((s) => s.switchContext);
  const logout = useAuth((s) => s.logout);
  const themeMode = usePreferences((s) => s.themeMode);
  const setThemeMode = usePreferences((s) => s.setThemeMode);
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: careApi.sessions });
  const revoke = useMutation({ mutationFn: careApi.revokeSession, onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const pending = useSync((s) => s.pending);

  if (!user) return null;
  const contexts: Array<{ exp: Experience; hospitalId: string; label: string }> = [
    ...user.memberships.map((m) => ({ exp: 'STAFF' as const, hospitalId: m.hospitalId, label: `${m.hospitalName} · ${m.roles.map(humanize).join(', ')}` })),
    ...user.patientProfiles.map((p) => ({ exp: 'PATIENT' as const, hospitalId: p.hospitalId, label: `${p.hospitalName} · Patient` })),
    ...user.caregiverOf.map((c) => ({ exp: 'CAREGIVER' as const, hospitalId: c.hospitalId, label: `Caregiver for ${c.patientName}` })),
  ];

  const confirmLogout = () => {
    const warn = pending ? `You have ${pending} item(s) waiting to be sent. Signing out will remove them from this phone.` : 'You will need to sign in again to see your recovery information.';
    Alert.alert('Sign out?', warn, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout().then(() => router.replace('/(auth)/login')) },
    ]);
  };

  return (
    <Screen>
      <Header title="Profile" />
      <Card>
        <Row gap={spacing.md}>
          <Avatar name={`${user.firstName} ${user.lastName}`} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="heading">
              {user.firstName} {user.lastName}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {user.email ?? user.phone}
            </Text>
          </View>
        </Row>
      </Card>

      {children}

      {contexts.length > 1 ? (
        <Section title="Switch account view">
          <Card>
            {contexts.map((c) => {
              const active = c.exp === actingAs && (c.hospitalId === user.activeHospitalId || !user.activeHospitalId);
              return (
                <ListRow
                  key={`${c.exp}-${c.hospitalId}-${c.label}`}
                  icon={c.exp === 'STAFF' ? 'briefcase-outline' : c.exp === 'PATIENT' ? 'heart-outline' : 'people-outline'}
                  title={c.label}
                  right={active ? <Badge label="Active" tone="success" /> : undefined}
                  onPress={active ? undefined : () => void switchContext(c.exp, c.hospitalId).then(() => router.replace('/'))}
                />
              );
            })}
          </Card>
        </Section>
      ) : null}

      <Section title="Settings">
        <Card>
          <ListRow icon="language-outline" title="Language" subtitle={LANGUAGE_LABELS[usePreferences.getState().language]} onPress={() => router.push(`${prefix}/language` as never)} />
          <ListRow icon="phone-portrait-outline" title="Verify phone number" onPress={() => router.push({ pathname: '/(auth)/verify', params: { channel: 'SMS' } })} />
          {prefix === '/(patient)' ? <ListRow icon="people-outline" title="Caregivers" subtitle="Choose who can help with your recovery" onPress={() => router.push('/(patient)/caregivers')} /> : null}
          {prefix !== '/(staff)' ? <ListRow icon="help-buoy-outline" title="Help & emergency information" onPress={() => router.push(`${prefix}/help` as never)} /> : null}
        </Card>
        <View style={{ marginTop: spacing.md }}>
          <Text variant="label" style={{ marginBottom: spacing.sm }}>
            Appearance
          </Text>
          <ChoiceChips label="Appearance" value={themeMode} onChange={setThemeMode} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </View>
      </Section>

      <Section title="Signed-in devices">
        <Card>
          {sessions.isLoading ? (
            <LoadingCards count={1} />
          ) : (
            (sessions.data ?? []).map((s) => (
              <ListRow
                key={s.id}
                icon={s.platform === 'ios' ? 'logo-apple' : s.platform === 'android' ? 'logo-android' : 'desktop-outline'}
                title={s.deviceName ?? humanize(s.platform ?? 'device')}
                subtitle={s.lastUsedAt ? `Last used ${relativeTime(s.lastUsedAt)}` : undefined}
                right={s.current ? <Badge label="This device" tone="primary" /> : <Button title="Sign out" variant="ghost" size="sm" fullWidth={false} onPress={() => revoke.mutate(s.id)} />}
              />
            ))
          )}
        </Card>
      </Section>

      <Button title="Sign out" icon="log-out-outline" variant="outline" style={{ marginTop: spacing.xxl }} onPress={confirmLogout} />
      <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.lg, color: colors.textMuted }}>
        RecoverOS 0.1.0
      </Text>
    </Screen>
  );
}

export function LanguageScreen() {
  const { spacing } = useTheme();
  const language = usePreferences((s) => s.language);
  const setLanguage = usePreferences((s) => s.setLanguage);
  const save = useMutation({ mutationFn: (l: Language) => careApi.updateProfile({ preferredLanguage: l }) });
  return (
    <Screen>
      <Header back title="Language" subtitle="Used for app labels, reminders and simplified explanations." />
      <Card>
        {LANGUAGES.map((l) => (
          <ListRow
            key={l}
            icon={language === l ? 'radio-button-on' : 'radio-button-off'}
            title={LANGUAGE_LABELS[l]}
            onPress={() => {
              setLanguage(l);
              save.mutate(l);
            }}
          />
        ))}
      </Card>
      <Text variant="caption" tone="secondary" style={{ marginTop: spacing.lg }}>
        Instructions from your care team are shown as they wrote them. Translated explanations are AI-assisted and clearly labelled.
      </Text>
    </Screen>
  );
}

export function HelpScreen() {
  const { spacing } = useTheme();
  const hospital = useHospitalInfo();
  return (
    <Screen>
      <Header back title="Help & emergency" />
      <EmergencyCard />
      <Section title="Contact your hospital">
        <Card>
          <ListRow icon="business-outline" title={hospital.data?.name ?? 'Your hospital'} subtitle={hospital.data?.phone} onPress={hospital.data?.phone ? () => void Linking.openURL(`tel:${hospital.data!.phone}`) : undefined} />
          <ListRow icon="chatbubble-ellipses-outline" title="Message your care team" subtitle="For non-urgent questions" onPress={() => router.push('/(patient)/messages/new')} />
        </Card>
      </Section>
      <Section title="About RecoverOS">
        <Card>
          <Text variant="bodySmall" tone="secondary">
            RecoverOS helps you follow the recovery plan approved by your care team. It does not diagnose, does not replace medical advice, and is not monitored as an emergency service. Your information is shared only with your hospital care team and the people you choose.
          </Text>
        </Card>
      </Section>
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

/** Patient discharge documents (approved, patient-visible files). */
export function DocumentsScreen() {
  const { spacing } = useTheme();
  const q = useQuery({ queryKey: careKeys.documents({}), queryFn: () => careApi.documents({}) });
  const [error, setError] = useState<string | null>(null);
  const open = async (id: string) => {
    setError(null);
    try {
      const { url } = await careApi.downloadUrl(id);
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Documents" subtitle="Discharge summaries and recovery instructions" />
      {error ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="danger" title="Could not open document" message={error} />
        </View>
      ) : null}
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon="folder-open-outline" title="No documents yet" message="Documents your care team shares with you will appear here." />
      ) : (
        <Card>
          {q.data.map((d) => (
            <ListRow key={d.id} icon={d.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} title={d.title} subtitle={`${humanize(d.type)} · ${formatDate(d.createdAt)}`} onPress={() => void open(d.id)} />
          ))}
        </Card>
      )}
      <Text variant="caption" tone="secondary" align="center" style={{ marginTop: spacing.lg }}>
        Download links expire after 5 minutes for your privacy.
      </Text>
    </Screen>
  );
}

/** Offline items rejected by the server, so the user can review/discard them. */
export function SyncIssues() {
  const user = useAuth((s) => s.user);
  const failed = useSync((s) => s.needsAttention);
  if (!failed.length || !user) return null;
  return (
    <Banner tone="warning" title="Some saved items could not be sent" message="They may be out of date. Please re-enter them if still needed.">
      {failed.map((f) => (
        <Button key={f.id} title={`Discard ${humanize(f.kind)} (${formatDate(new Date(f.createdAt))})`} variant="ghost" size="sm" onPress={() => void outbox.discard(f.id).then(() => useSync.getState().refresh(user.id))} />
      ))}
    </Banner>
  );
}
