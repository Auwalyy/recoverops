import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, Screen, Section } from '@/components/ui';
import { careApi, careKeys } from '@/features/care/api';
import { errorMessage } from '@/services/api/client';
import { formatDateTime, fullName, humanize } from '@/utils/format';

/** Physiotherapist: scheduled sessions and assigned rehabilitation plans. */
export default function RehabSessions() {
  const sessions = useQuery({ queryKey: careKeys.rehabSessions({ mine: true }), queryFn: () => careApi.rehabSessions({ mine: true, from: new Date(Date.now() - 7 * 86400_000).toISOString() }) });
  const plans = useQuery({ queryKey: careKeys.rehabPlans({ mine: true }), queryFn: () => careApi.rehabPlans({ mine: true }) });
  const upcoming = (sessions.data?.items ?? []).filter((s) => s.status === 'SCHEDULED');
  const recent = (sessions.data?.items ?? []).filter((s) => s.status !== 'SCHEDULED');
  return (
    <Screen onRefresh={() => { void sessions.refetch(); void plans.refetch(); }} refreshing={sessions.isRefetching}>
      <Header title="Rehabilitation" subtitle="Sessions and plans assigned to you" />
      {sessions.isLoading ? (
        <LoadingCards />
      ) : sessions.error ? (
        <ErrorState message={errorMessage(sessions.error)} onRetry={() => void sessions.refetch()} />
      ) : (
        <>
          <Section title="Scheduled" style={{ marginTop: 0 }}>
            {upcoming.length ? (
              <Card>
                {upcoming.map((s) => (
                  <ListRow key={s.id} icon="walk-outline" title={fullName(s.patientId as { firstName: string; lastName: string })} subtitle={`${formatDateTime(s.scheduledAt)} · ${s.location ?? humanize(s.mode)}`} onPress={() => router.push(`/(staff)/rehab/${s.planId}`)} />
                ))}
              </Card>
            ) : (
              <EmptyState icon="calendar-outline" title="No scheduled sessions" />
            )}
          </Section>
          {recent.length ? (
            <Section title="Recent">
              <Card>
                {recent.map((s) => (
                  <ListRow key={s.id} icon="time-outline" title={fullName(s.patientId as { firstName: string; lastName: string })} subtitle={formatDateTime(s.scheduledAt)} right={<Badge label={humanize(s.status)} tone={s.status === 'ATTENDED' ? 'success' : 'warning'} />} onPress={() => router.push(`/(staff)/rehab/${s.planId}`)} />
                ))}
              </Card>
            </Section>
          ) : null}
          <Section title="My rehabilitation plans">
            <Card>
              {(plans.data ?? []).map((p) => (
                <ListRow key={p.id} icon="clipboard-outline" title={fullName(p.patientId as { firstName: string; lastName: string })} subtitle={p.goals[0]} right={<Badge label={humanize(p.status)} tone="primary" />} onPress={() => router.push(`/(staff)/rehab/${p.id}`)} />
              ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
