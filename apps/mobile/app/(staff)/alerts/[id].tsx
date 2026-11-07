import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Banner, Button, Card, ChoiceChips, ErrorState, Header, ListRow, LoadingCards, Row, Screen, Section, Text, TextField } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, useAuth } from '@/store/auth';
import { monitoringApi, monitoringKeys, useAlert } from '@/features/monitoring/api';
import { useStaff } from '@/features/care/api';
import { errorMessage } from '@/services/api/client';
import { alertStatusTone, formatDateTime, fullName, humanize, priorityTone, relativeTime } from '@/utils/format';

type Mode = null | 'contact' | 'review' | 'resolve' | 'assign';

/** Alert review: acknowledge, document contact & clinical actions, assign, resolve. */
export default function AlertDetail() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const can = (p: string) => hasPermission(user, p);
  const q = useAlert(id);
  const staff = useStaff();
  const [mode, setMode] = useState<Mode>(null);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('REACHED');
  const [resolution, setResolution] = useState('ADVICE_GIVEN');
  const [assignee, setAssignee] = useState<string | undefined>();

  const done = () => {
    setMode(null);
    setNotes('');
    void qc.invalidateQueries({ queryKey: monitoringKeys.alert(id) });
    void qc.invalidateQueries({ queryKey: ['alerts'] });
  };
  const ack = useMutation({ mutationFn: () => monitoringApi.acknowledge(id), onSuccess: done });
  const action = useMutation({
    mutationFn: () =>
      mode === 'contact'
        ? monitoringApi.addAction(id, { type: outcome === 'REACHED' ? 'PATIENT_CONTACTED' : 'PATIENT_CONTACT_ATTEMPT', notes, contactOutcome: outcome })
        : monitoringApi.addAction(id, { type: 'CLINICAL_REVIEW', notes, setStatus: 'UNDER_REVIEW' }),
    onSuccess: done,
  });
  const resolve = useMutation({ mutationFn: () => monitoringApi.resolve(id, { outcome: resolution, notes }), onSuccess: done });
  const assign = useMutation({ mutationFn: () => monitoringApi.assign(id, { userId: assignee!, note: notes || undefined }), onSuccess: done });
  const err = ack.error ?? action.error ?? resolve.error ?? assign.error;

  const a = q.data?.alert;
  const open = a && !['RESOLVED', 'CLOSED'].includes(a.status);
  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Alert" />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error || !a ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Badge label={a.priority} tone={priorityTone(a.priority)} />
              <Badge label={humanize(a.status)} tone={alertStatusTone(a.status)} />
            </Row>
            <Text variant="title" style={{ marginTop: spacing.sm }}>
              {a.title}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              {humanize(a.source)} · {relativeTime(a.createdAt)}
              {a.escalationLevel ? ` · escalated (level ${a.escalationLevel})` : ''}
            </Text>
            {a.summary ? (
              <Text variant="body" style={{ marginTop: spacing.md }}>
                {a.summary}
              </Text>
            ) : null}
            {a.matchedConditions?.length ? (
              <View style={{ marginTop: spacing.md }}>
                <Text variant="label">What matched (patient-reported)</Text>
                {a.matchedConditions.map((m, i) => (
                  <Text key={i} variant="bodySmall" tone="secondary">
                    {m.field.replace('answers.', '')}: {String(m.actual)} ({m.op} {String(m.expected)})
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>

          <Section title="Patient">
            <Card>
              <ListRow icon="person-outline" title={fullName(a.patientId)} subtitle={a.patientId.hospitalPatientRef} onPress={() => router.push(`/(staff)/episodes/${a.episodeId}`)} />
              {a.patientId.phone ? <ListRow icon="call-outline" title={a.patientId.phone} subtitle="Call patient" onPress={() => void Linking.openURL(`tel:${a.patientId.phone}`)} /> : null}
            </Card>
          </Section>

          {err ? (
            <View style={{ marginTop: spacing.lg }}>
              <Banner tone="danger" title="Action failed" message={errorMessage(err)} />
            </View>
          ) : null}

          {open ? (
            <Section title="Actions">
              {!a.acknowledgedAt && can('alerts.acknowledge') ? <Button title="Acknowledge" icon="hand-left-outline" loading={ack.isPending} onPress={() => ack.mutate()} /> : null}
              {mode ? (
                <Card style={{ marginTop: spacing.md }}>
                  {mode === 'contact' ? (
                    <>
                      <Text variant="label" style={{ marginBottom: spacing.sm }}>
                        Contact outcome
                      </Text>
                      <ChoiceChips label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: 'REACHED', label: 'Reached' }, { value: 'NO_ANSWER', label: 'No answer' }, { value: 'VOICEMAIL', label: 'Voicemail' }, { value: 'WRONG_NUMBER', label: 'Wrong number' }]} />
                      <View style={{ height: spacing.md }} />
                    </>
                  ) : null}
                  {mode === 'resolve' ? (
                    <>
                      <Text variant="label" style={{ marginBottom: spacing.sm }}>
                        Outcome
                      </Text>
                      <ChoiceChips
                        label="Resolution outcome"
                        value={resolution}
                        onChange={setResolution}
                        options={['ADVICE_GIVEN', 'APPOINTMENT_ARRANGED', 'REFERRED_TO_EMERGENCY', 'MEDICATION_REVIEWED', 'NO_ACTION_REQUIRED', 'PATIENT_UNREACHABLE', 'OTHER'].map((o) => ({ value: o, label: humanize(o) }))}
                      />
                      <View style={{ height: spacing.md }} />
                    </>
                  ) : null}
                  {mode === 'assign' ? (
                    <>
                      <Text variant="label" style={{ marginBottom: spacing.sm }}>
                        Assign to
                      </Text>
                      {(staff.data ?? [])
                        .filter((s) => s.roles.some((r) => ['DOCTOR', 'MEDICAL_DIRECTOR', 'RECOVERY_NURSE', 'DISCHARGE_NURSE', 'RECOVERY_COORDINATOR', 'PHARMACIST'].includes(r)))
                        .map((s) => (
                          <ListRow key={s.userId} icon={assignee === s.userId ? 'radio-button-on' : 'radio-button-off'} title={fullName(s)} subtitle={s.roles.map(humanize).join(', ')} onPress={() => setAssignee(s.userId)} />
                        ))}
                    </>
                  ) : null}
                  <TextField label={mode === 'assign' ? 'Note (optional)' : 'Notes'} value={notes} onChangeText={setNotes} multiline />
                  <Button
                    title="Save"
                    disabled={mode === 'assign' ? !assignee : notes.trim().length < 3}
                    loading={action.isPending || resolve.isPending || assign.isPending}
                    onPress={() => (mode === 'resolve' ? resolve.mutate() : mode === 'assign' ? assign.mutate() : action.mutate())}
                  />
                  <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
                </Card>
              ) : (
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {can('alerts.acknowledge') ? <Button title="Record patient contact" icon="call-outline" variant="outline" onPress={() => setMode('contact')} /> : null}
                  {can('alerts.acknowledge') ? <Button title="Add clinical review note" icon="document-text-outline" variant="outline" onPress={() => setMode('review')} /> : null}
                  {can('alerts.assign') ? <Button title="Reassign" icon="swap-horizontal-outline" variant="outline" onPress={() => setMode('assign')} /> : null}
                  {can('alerts.resolve') && a.acknowledgedAt ? <Button title="Resolve" icon="checkmark-done-outline" onPress={() => setMode('resolve')} /> : null}
                </View>
              )}
            </Section>
          ) : a.resolution ? (
            <Section title="Resolution">
              <Card>
                <Text variant="subheading">{humanize(a.resolution.outcome)}</Text>
                <Text variant="body" style={{ marginTop: 4 }}>
                  {a.resolution.notes}
                </Text>
                <Text variant="caption" tone="secondary" style={{ marginTop: 4 }}>
                  {fullName(a.resolution.resolvedBy)} · {formatDateTime(a.resolution.resolvedAt)}
                </Text>
              </Card>
            </Section>
          ) : null}

          <Section title="History">
            <Card>
              {q.data!.actions
                .slice()
                .reverse()
                .map((h) => (
                  <ListRow
                    key={h.id}
                    icon={h.bySystem ? 'hardware-chip-outline' : h.type.includes('CONTACT') ? 'call-outline' : 'create-outline'}
                    title={h.type === 'STATUS_CHANGE' ? `Status: ${humanize(h.toStatus)}` : humanize(h.type)}
                    subtitle={`${h.bySystem ? 'System' : fullName(h.actorId)} · ${formatDateTime(h.createdAt)}${h.contactOutcome ? ` · ${humanize(h.contactOutcome)}` : ''}${h.notes ? `\n${h.notes}` : ''}`}
                  />
                ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
