import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, ProgressBar, Row, ScaleSelector, Screen, Section, Text } from '@/components/ui';
import { careApi, careKeys } from '@/features/care/api';
import { useMyActiveEpisode } from '@/features/recovery/api';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { newIdempotencyKey, submitOrQueue } from '@/offline/sync';
import { errorMessage } from '@/services/api/client';
import { formatDate, formatDateTime, fullName, humanize } from '@/utils/format';
import { useT } from '@/i18n';

/** Rehabilitation plan authored by the physiotherapist + patient-reported difficulty. */
export default function Rehabilitation() {
  const { spacing } = useTheme();
  const t = useT();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? '');
  const { episode } = useMyActiveEpisode();
  const plans = useQuery({ queryKey: careKeys.rehabPlans({ episodeId: episode?.id }), queryFn: () => careApi.rehabPlans({ episodeId: episode!.id }), enabled: !!episode });
  const planId = plans.data?.[0]?.id;
  const detail = useQuery({ queryKey: careKeys.rehabPlan(planId ?? ''), queryFn: () => careApi.rehabPlan(planId!), enabled: !!planId });
  const [difficulty, setDifficulty] = useState<number | undefined>();
  const key = useMemo(() => newIdempotencyKey('rehab'), []);
  const lastSession = detail.data?.sessions.filter((s) => new Date(s.scheduledAt).getTime() < Date.now()).at(-1);
  const nextSession = detail.data?.sessions.find((s) => s.status === 'SCHEDULED' && new Date(s.scheduledAt).getTime() > Date.now());
  const report = useMutation({
    mutationFn: () => submitOrQueue(userId, 'REHAB_DIFFICULTY', `/rehabilitation/sessions/${lastSession!.id}/difficulty`, { difficulty, idempotencyKey: key }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: careKeys.rehabPlan(planId ?? '') }),
  });

  const plan = detail.data?.plan;
  return (
    <Screen onRefresh={() => void detail.refetch()} refreshing={detail.isRefetching}>
      <Header back title="Rehabilitation" subtitle="Exercises from your physiotherapist" />
      {plans.isLoading || detail.isLoading ? (
        <LoadingCards />
      ) : plans.error ? (
        <ErrorState message={errorMessage(plans.error)} onRetry={() => void plans.refetch()} />
      ) : !plan ? (
        <EmptyState icon="walk-outline" title="No rehabilitation plan" message="If your recovery includes physiotherapy, your plan will appear here." />
      ) : (
        <>
          <Card>
            <Text variant="overline" tone="secondary">
              Physiotherapist
            </Text>
            <Text variant="heading" style={{ marginTop: 2 }}>
              {fullName(plan.physiotherapistId as { firstName: string; lastName: string })}
            </Text>
            <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
              {plan.goals.map((g) => (
                <Text key={g} variant="bodySmall">
                  ◦ {g}
                </Text>
              ))}
            </View>
            {detail.data?.attendanceRate != null ? (
              <View style={{ marginTop: spacing.lg }}>
                <Text variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
                  Sessions attended: {Math.round(detail.data.attendanceRate * 100)}%
                </Text>
                <ProgressBar value={detail.data.attendanceRate} tone="success" />
              </View>
            ) : null}
          </Card>

          {nextSession ? (
            <Section title="Next session">
              <Card>
                <ListRow icon="calendar-outline" title={formatDateTime(nextSession.scheduledAt)} subtitle={nextSession.location ?? humanize(nextSession.mode)} />
              </Card>
            </Section>
          ) : null}

          <Section title="Your exercises">
            <View style={{ gap: spacing.md }}>
              {plan.exercises.map((e) => (
                <Card key={e.name}>
                  <Text variant="subheading">{e.name}</Text>
                  <Row gap={6} style={{ flexWrap: 'wrap', marginTop: spacing.sm }}>
                    {e.sets ? <Badge label={`${e.sets} sets`} tone="primary" /> : null}
                    {e.repetitions ? <Badge label={`${e.repetitions} reps`} tone="primary" /> : null}
                    {e.holdSeconds ? <Badge label={`Hold ${e.holdSeconds}s`} tone="primary" /> : null}
                    {e.frequencyText ? <Badge label={e.frequencyText} tone="neutral" /> : null}
                  </Row>
                  <Text variant="body" style={{ marginTop: spacing.sm }}>
                    {e.instructions}
                  </Text>
                </Card>
              ))}
            </View>
            <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
              Stop and contact your care team if an exercise causes severe pain.
            </Text>
          </Section>

          {plan.milestones.length ? (
            <Section title="Milestones">
              <Card>
                {plan.milestones.map((m) => (
                  <ListRow key={m.id} icon={m.achievedAt ? 'checkmark-circle' : 'flag-outline'} title={m.title} subtitle={m.achievedAt ? `Achieved ${formatDate(m.achievedAt)}` : m.targetDate ? `Target ${formatDate(m.targetDate)}` : undefined} />
                ))}
              </Card>
            </Section>
          ) : null}

          {lastSession ? (
            <Section title="How hard were your exercises?">
              <Card>
                {report.isSuccess ? (
                  <Banner tone="success" title="Thanks" message={(report.data as { queued?: boolean })?.queued ? t('common.offlineQueued') : 'Your physiotherapist can see your answer.'} />
                ) : (
                  <>
                    <ScaleSelector label="Exercise difficulty" value={difficulty} onChange={setDifficulty} lowLabel="Very easy" highLabel="Very hard" />
                    {report.error ? <Text variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>{errorMessage(report.error)}</Text> : null}
                    <Button title={t('common.submit')} style={{ marginTop: spacing.lg }} disabled={difficulty === undefined} loading={report.isPending} onPress={() => report.mutate()} />
                  </>
                )}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
