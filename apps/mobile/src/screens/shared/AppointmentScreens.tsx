import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, Row, Screen, Section, Text, TextField } from '@/components/ui';
import { careApi, careKeys, useAppointments } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { formatDateTime, fullName, humanize } from '@/utils/format';
import type { Appointment } from '@/types/models';

const statusTone = (s: string) => (s === 'CONFIRMED' || s === 'ATTENDED' ? 'success' : s === 'RESCHEDULE_REQUESTED' ? 'warning' : s === 'MISSED' || s === 'CANCELLED' ? 'danger' : 'info');

export function AppointmentListScreen({ basePath }: { basePath: '/(patient)/appointments' | '/(caregiver)/appointments' }) {
  const { spacing } = useTheme();
  const q = useAppointments({});
  const upcoming = (q.data?.items ?? []).filter((a) => new Date(a.scheduledAt).getTime() >= Date.now() - 3600_000 && !['CANCELLED', 'ATTENDED', 'MISSED'].includes(a.status));
  const past = (q.data?.items ?? []).filter((a) => !upcoming.includes(a)).reverse();
  const row = (a: Appointment) => (
    <ListRow key={a.id} icon="calendar-outline" title={humanize(a.type)} subtitle={`${formatDateTime(a.scheduledAt)}${a.location ? ` · ${a.location}` : ''}`} right={<Badge label={humanize(a.status)} tone={statusTone(a.status)} />} onPress={() => router.push(`${basePath}/${a.id}`)} />
  );
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Appointments" />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="calendar-outline" title="No appointments" message="Your follow-up appointments will appear here." />
      ) : (
        <>
          <Section title="Upcoming" style={{ marginTop: 0 }}>
            <Card>{upcoming.length ? upcoming.map(row) : <Text variant="bodySmall" tone="secondary">No upcoming appointments.</Text>}</Card>
          </Section>
          {past.length ? (
            <Section title="Past">
              <Card>{past.map(row)}</Card>
            </Section>
          ) : null}
        </>
      )}
      <View style={{ height: spacing.lg }} />
    </Screen>
  );
}

export function AppointmentDetailScreen() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: careKeys.appointment(id), queryFn: () => careApi.appointment(id), enabled: !!id });
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const respond = useMutation({
    mutationFn: (action: 'CONFIRM' | 'REQUEST_RESCHEDULE') => careApi.respondAppointment(id, { action, reason: reason || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: careKeys.appointment(id) });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      setMode('view');
    },
  });
  const a = q.data;
  const actionable = a && ['SCHEDULED', 'CONFIRMED'].includes(a.status) && new Date(a.scheduledAt).getTime() > Date.now();

  return (
    <Screen keyboard>
      <Header back title="Appointment" />
      {q.isLoading ? (
        <LoadingCards count={2} />
      ) : q.error || !a ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" tone="secondary">
                {humanize(a.type)}
              </Text>
              <Badge label={humanize(a.status)} tone={statusTone(a.status)} />
            </Row>
            <Text variant="title" style={{ marginTop: spacing.sm }}>
              {formatDateTime(a.scheduledAt)}
            </Text>
            <ListRow icon={a.mode === 'IN_PERSON' ? 'location-outline' : a.mode === 'PHONE' ? 'call-outline' : 'videocam-outline'} title={a.location ?? humanize(a.mode)} subtitle={`${a.durationMinutes} minutes`} />
            {a.clinicianId ? <ListRow icon="person-outline" title={fullName(a.clinicianId)} subtitle="Clinician" /> : null}
          </Card>
          {a.instructions ? (
            <Section title="Before your appointment">
              <Card>
                <Text variant="body">{a.instructions}</Text>
              </Card>
            </Section>
          ) : null}
          {respond.error ? (
            <View style={{ marginTop: spacing.lg }}>
              <Banner tone="danger" title="Could not update" message={errorMessage(respond.error)} />
            </View>
          ) : null}
          {actionable ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
              {mode === 'reschedule' ? (
                <>
                  <TextField label="Why do you need a different time?" value={reason} onChangeText={setReason} multiline />
                  <Button title="Send reschedule request" loading={respond.isPending} onPress={() => respond.mutate('REQUEST_RESCHEDULE')} />
                  <Button title="Cancel" variant="ghost" onPress={() => setMode('view')} />
                </>
              ) : (
                <>
                  {a.status !== 'CONFIRMED' ? <Button title="Confirm I will attend" icon="checkmark-circle-outline" loading={respond.isPending} onPress={() => respond.mutate('CONFIRM')} /> : null}
                  <Button title="Request a different time" variant="outline" onPress={() => setMode('reschedule')} />
                </>
              )}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
