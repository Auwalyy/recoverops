import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, ChoiceChips, EmptyState, ErrorState, Header, LoadingCards, Row, Screen, Text, TextField } from '@/components/ui';
import { careApi, useAppointments } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { formatDateTime, fullName, humanize } from '@/utils/format';
import type { Appointment } from '@/types/models';

function AppointmentItem({ a }: { a: Appointment }) {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const update = useMutation({
    mutationFn: (status?: 'ATTENDED' | 'MISSED' | 'CANCELLED') => careApi.updateAppointment(a.id, { status, followUpNote: note || undefined, reason: status === 'CANCELLED' ? 'Cancelled by staff' : undefined }),
    onSuccess: () => {
      setOpen(false);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
  const patient = typeof a.patientId === 'object' ? a.patientId : undefined;
  const actionable = ['SCHEDULED', 'CONFIRMED', 'RESCHEDULE_REQUESTED'].includes(a.status);
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading" onPress={() => router.push(`/(staff)/episodes/${a.episodeId}`)}>
            {fullName(patient)}
          </Text>
          <Text variant="bodySmall" tone="secondary">
            {humanize(a.type)} · {formatDateTime(a.scheduledAt)}
            {a.location ? ` · ${a.location}` : ''}
          </Text>
        </View>
        <Badge label={humanize(a.status)} tone={a.status === 'RESCHEDULE_REQUESTED' ? 'warning' : a.status === 'ATTENDED' || a.status === 'CONFIRMED' ? 'success' : 'info'} />
      </Row>
      {actionable ? (
        open ? (
          <View style={{ marginTop: spacing.md }}>
            <TextField label="Follow-up note" value={note} onChangeText={setNote} multiline />
            <Row gap={spacing.sm}>
              <Button title="Attended" size="md" style={{ flex: 1 }} loading={update.isPending && update.variables === 'ATTENDED'} onPress={() => update.mutate('ATTENDED')} />
              <Button title="Missed" size="md" variant="outline" style={{ flex: 1 }} loading={update.isPending && update.variables === 'MISSED'} onPress={() => update.mutate('MISSED')} />
            </Row>
            <Button title="Cancel appointment" variant="ghost" size="md" onPress={() => update.mutate('CANCELLED')} />
            {update.error ? <Text variant="caption" tone="danger">{errorMessage(update.error)}</Text> : null}
          </View>
        ) : (
          <Button title="Record attendance" variant="secondary" size="md" style={{ marginTop: spacing.md }} onPress={() => setOpen(true)} />
        )
      ) : null}
    </Card>
  );
}

/** Appointment management for clinicians/coordinators (mine or all upcoming). */
export default function StaffAppointments() {
  const { spacing } = useTheme();
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const q = useAppointments({ mine: scope === 'mine', from: new Date(Date.now() - 24 * 3600_000).toISOString() });
  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Appointments" />
      <ChoiceChips label="Scope" value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My appointments' }, { value: 'all', label: 'All visible' }]} />
      <View style={{ height: spacing.lg }} />
      {q.isLoading ? <LoadingCards /> : q.error ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="calendar-outline" title="No upcoming appointments" /> : q.data.items.map((a) => <AppointmentItem key={a.id} a={a} />)}
    </Screen>
  );
}
