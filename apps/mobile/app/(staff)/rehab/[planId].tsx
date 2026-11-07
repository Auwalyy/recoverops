import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Banner, Button, Card, ChoiceChips, EmptyState, ErrorState, Header, ListRow, LoadingCards, Row, ScaleSelector, Screen, Section, Text, TextField } from '@/components/ui';
import { careApi, careKeys } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, useAuth } from '@/store/auth';
import { errorMessage } from '@/services/api/client';
import { formatDate, formatDateTime, fullName, humanize } from '@/utils/format';
import type { RehabSession } from '@/types/models';

function RecordSession({ session, onDone }: { session: RehabSession; onDone: () => void }) {
  const { spacing } = useTheme();
  const [status, setStatus] = useState<'ATTENDED' | 'MISSED' | 'CANCELLED'>('ATTENDED');
  const [pain, setPain] = useState<number | undefined>();
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const m = useMutation({
    mutationFn: () => careApi.recordSession(session.id, { status, progressNotes: notes || undefined, assessment: status === 'ATTENDED' ? { ...(pain !== undefined ? { painScore: pain } : {}), ...(score ? { functionalScore: Number(score) } : {}) } : undefined }),
    onSuccess: onDone,
  });
  return (
    <View style={{ marginTop: spacing.md }}>
      <ChoiceChips label="Attendance" value={status} onChange={setStatus} options={[{ value: 'ATTENDED', label: 'Attended' }, { value: 'MISSED', label: 'Missed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
      {status === 'ATTENDED' ? (
        <View style={{ marginTop: spacing.md }}>
          <Text variant="label" style={{ marginBottom: spacing.sm }}>
            Pain during session (patient-reported)
          </Text>
          <ScaleSelector label="Pain" value={pain} onChange={setPain} lowLabel="None" highLabel="Worst" />
          <View style={{ height: spacing.md }} />
          <TextField label="Functional score (0–100, optional)" keyboardType="number-pad" value={score} onChangeText={setScore} />
        </View>
      ) : null}
      <TextField label="Progress notes" value={notes} onChangeText={setNotes} multiline />
      {m.error ? <Text variant="caption" tone="danger">{errorMessage(m.error)}</Text> : null}
      <Button title="Save session" loading={m.isPending} onPress={() => m.mutate()} />
    </View>
  );
}

/** Physiotherapist plan view: exercises, sessions, attendance, progress, milestones, review notes. */
export default function RehabPlanDetail() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ planId: string; episodeId?: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const canManage = hasPermission(user, 'rehabilitation.manage');
  const byEpisode = useQuery({ queryKey: careKeys.rehabPlans({ episodeId: params.episodeId }), queryFn: () => careApi.rehabPlans({ episodeId: params.episodeId }), enabled: params.planId === 'episode' && !!params.episodeId });
  const planId = params.planId === 'episode' ? byEpisode.data?.[0]?.id : params.planId;
  const q = useQuery({ queryKey: careKeys.rehabPlan(planId ?? ''), queryFn: () => careApi.rehabPlan(planId!), enabled: !!planId });
  const [recording, setRecording] = useState<string | null>(null);
  const [review, setReview] = useState('');
  const [nextAt, setNextAt] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: careKeys.rehabPlan(planId ?? '') });
  const addReview = useMutation({ mutationFn: () => careApi.reviewRehabPlan(planId!, review), onSuccess: () => { setReview(''); refresh(); } });
  const milestone = useMutation({ mutationFn: (mid: string) => careApi.achieveMilestone(planId!, mid), onSuccess: refresh });
  const schedule = useMutation({ mutationFn: () => careApi.scheduleSession({ planId: planId!, scheduledAt: `${nextAt.replace(' ', 'T')}:00+01:00`, location: q.data?.sessions.at(-1)?.location }), onSuccess: () => { setNextAt(''); refresh(); } });

  const plan = q.data?.plan;
  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Rehabilitation plan" subtitle={plan ? fullName(plan.patientId as { firstName: string; lastName: string }) : undefined} />
      {byEpisode.isLoading || q.isLoading ? (
        <LoadingCards />
      ) : params.planId === 'episode' && !planId ? (
        <EmptyState icon="walk-outline" title="No rehabilitation plan" message="A physiotherapist assigned to this episode can create one." />
      ) : q.error || !plan ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" tone="secondary">
                Since {formatDate(plan.startDate)}
              </Text>
              <Badge label={humanize(plan.status)} tone="primary" />
            </Row>
            {plan.goals.map((g) => (
              <Text key={g} variant="body" style={{ marginTop: 4 }}>
                ◦ {g}
              </Text>
            ))}
            {q.data!.attendanceRate != null ? (
              <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                Attendance {Math.round(q.data!.attendanceRate * 100)}%
              </Text>
            ) : null}
          </Card>

          <Section title="Exercises (clinician-authored)">
            <Card>
              {plan.exercises.map((e) => (
                <ListRow key={e.name} icon="body-outline" title={e.name} subtitle={[e.sets && `${e.sets}×`, e.repetitions && `${e.repetitions} reps`, e.frequencyText].filter(Boolean).join(' · ')} />
              ))}
            </Card>
          </Section>

          <Section title="Sessions">
            {q.data!.sessions.map((s) => (
              <Card key={s.id} style={{ marginBottom: spacing.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="subheading">{formatDateTime(s.scheduledAt)}</Text>
                  <Badge label={humanize(s.status)} tone={s.status === 'ATTENDED' ? 'success' : s.status === 'SCHEDULED' ? 'info' : 'warning'} />
                </Row>
                {s.progressNotes ? <Text variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>{s.progressNotes}</Text> : null}
                {s.assessment?.painScore != null ? <Text variant="caption" tone="secondary">Pain {s.assessment.painScore}/10{s.assessment.functionalScore != null ? ` · Function ${s.assessment.functionalScore}` : ''}</Text> : null}
                {canManage && s.status === 'SCHEDULED' ? (
                  recording === s.id ? (
                    <RecordSession session={s} onDone={() => { setRecording(null); refresh(); }} />
                  ) : (
                    <Button title="Record session" size="md" variant="secondary" style={{ marginTop: spacing.sm }} onPress={() => setRecording(s.id)} />
                  )
                ) : null}
              </Card>
            ))}
            {canManage ? (
              <Card tone="muted">
                <TextField label="Schedule next session (YYYY-MM-DD HH:mm)" value={nextAt} onChangeText={setNextAt} placeholder="2026-11-20 10:00" />
                <Button title="Schedule" size="md" disabled={!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nextAt)} loading={schedule.isPending} onPress={() => schedule.mutate()} />
                {schedule.error ? <Text variant="caption" tone="danger">{errorMessage(schedule.error)}</Text> : null}
              </Card>
            ) : null}
          </Section>

          {plan.milestones.length ? (
            <Section title="Milestones">
              <Card>
                {plan.milestones.map((m) => (
                  <ListRow key={m.id} icon={m.achievedAt ? 'checkmark-circle' : 'flag-outline'} title={m.title} subtitle={m.achievedAt ? `Achieved ${formatDate(m.achievedAt)}` : m.targetDate ? `Target ${formatDate(m.targetDate)}` : undefined} right={!m.achievedAt && canManage ? <Button title="Confirm" size="sm" variant="secondary" fullWidth={false} onPress={() => milestone.mutate(m.id)} /> : undefined} />
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title="Review history">
            <Card>
              {(plan.reviewNotes ?? []).map((n, i) => (
                <Text key={i} variant="bodySmall" style={{ marginBottom: spacing.sm }}>
                  <Text variant="caption" tone="secondary">
                    {formatDate(n.at)}:{' '}
                  </Text>
                  {n.note}
                </Text>
              ))}
              {canManage ? (
                <>
                  <TextField label="Add review note" value={review} onChangeText={setReview} multiline />
                  <Button title="Save note" size="md" disabled={review.trim().length < 3} loading={addReview.isPending} onPress={() => addReview.mutate()} />
                </>
              ) : null}
              {addReview.error ? <Banner tone="danger" title="Could not save" message={errorMessage(addReview.error)} /> : null}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
