import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Badge, Button, Card, ErrorState, Header, ListRow, LoadingCards, Screen, Section, Text } from '@/components/ui';
import { usePatient } from '@/features/recovery/api';
import { hasPermission, useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api/client';
import { episodeStatusTone, formatDate, humanize } from '@/utils/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Patient overview: demographics needed for coordination + recovery episodes. */
export default function PatientOverview() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const q = usePatient(id);
  const p = q.data?.patient;
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title={p ? `${p.firstName} ${p.lastName}` : 'Patient'} subtitle={p?.hospitalPatientRef} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error || !p ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <ListRow icon="calendar-outline" title={formatDate(p.dateOfBirth)} subtitle={`Date of birth · ${humanize(p.sex)}`} />
            {p.phone ? <ListRow icon="call-outline" title={p.phone} subtitle="Phone" onPress={() => void Linking.openURL(`tel:${p.phone}`)} /> : null}
            <ListRow icon="language-outline" title={humanize(p.preferredLanguage === 'ha' ? 'HAUSA' : p.preferredLanguage === 'pcm' ? 'PIDGIN' : 'ENGLISH')} subtitle="Preferred language" />
            {p.emergencyContact ? <ListRow icon="people-outline" title={p.emergencyContact.name} subtitle={`${p.emergencyContact.relationship} · ${p.emergencyContact.phone}`} /> : null}
            <ListRow icon="shield-checkmark-outline" title={humanize(p.consentStatus)} subtitle="Consent" right={p.userId ? <Badge label="App active" tone="success" /> : <Badge label="No app account" />} />
          </Card>
          <Section title="Recovery episodes">
            <Card>
              {q.data!.episodes.length ? (
                q.data!.episodes.map((e) => (
                  <ListRow key={e.id} icon="pulse-outline" title={e.programmeName ?? e.procedureReference ?? 'Recovery episode'} subtitle={`Admitted ${formatDate(e.admissionDate)}${e.dischargeDate ? ` · discharged ${formatDate(e.dischargeDate)}` : ''}`} right={<Badge label={humanize(e.status)} tone={episodeStatusTone(e.status)} />} onPress={() => router.push(`/(staff)/episodes/${e.id}`)} />
                ))
              ) : (
                <Text variant="bodySmall" tone="secondary">
                  No episodes yet.
                </Text>
              )}
            </Card>
          </Section>
          {hasPermission(user, 'recovery.create') ? (
            <Button title="Start a recovery episode" icon="add-circle-outline" variant="secondary" style={{ marginTop: spacing.xl }} onPress={() => router.push({ pathname: '/(staff)/patients/new', params: { patientId: p.id } })} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
