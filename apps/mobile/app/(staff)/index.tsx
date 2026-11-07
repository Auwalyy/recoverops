import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, ListRow, Row, Screen, Section, Text } from '@/components/ui';
import { AlertCard, StatTile } from '@/components/staff';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, staffRoles, useAuth } from '@/store/auth';
import { careApi, careKeys } from '@/features/care/api';
import { monitoringApi, monitoringKeys, useAlerts } from '@/features/monitoring/api';
import { recoveryApi, recoveryKeys } from '@/features/recovery/api';
import { formatTime, fullName, greeting, humanize, relativeTime } from '@/utils/format';

/**
 * Role-aware staff dashboard. Each section renders only when the user holds the
 * permission behind it; counts are live from the API (no placeholder statistics).
 */
export default function StaffDashboard() {
  const { spacing } = useTheme();
  const user = useAuth((s) => s.user);
  const roles = staffRoles(user);
  const can = (p: string) => hasPermission(user, p);
  const membership = user?.memberships.find((m) => m.hospitalId === user.activeHospitalId) ?? user?.memberships[0];

  const workload = useQuery({ queryKey: careKeys.workload, queryFn: careApi.workload });
  const myAlerts = useAlerts({ open: true, assignedToMe: true }, can('alerts.read'));
  const approvals = useQuery({ queryKey: recoveryKeys.pendingApprovals, queryFn: recoveryApi.pendingApprovals, enabled: can('discharge.approve') });
  const review = useQuery({ queryKey: monitoringKeys.reviewQueue, queryFn: monitoringApi.reviewQueue, enabled: can('checkins.read') });
  const missed = useQuery({ queryKey: monitoringKeys.missed, queryFn: monitoringApi.missedQueue, enabled: can('checkins.read') });
  const concerns = useQuery({ queryKey: monitoringKeys.concerns, queryFn: monitoringApi.concerns, enabled: can('medication.review') });
  const sessions = useQuery({
    queryKey: careKeys.rehabSessions({ mine: true, today: true }),
    queryFn: () => careApi.rehabSessions({ mine: true, from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() }),
    enabled: can('rehabilitation.manage'),
  });
  const dashboard = useQuery({ queryKey: careKeys.dashboard, queryFn: careApi.dashboard, enabled: can('reports.read') });

  const refresh = () => {
    for (const q of [workload, myAlerts, approvals, review, missed, concerns, sessions, dashboard]) void q.refetch();
  };

  return (
    <Screen onRefresh={refresh} refreshing={workload.isRefetching}>
      <View style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
        <Text variant="bodySmall" tone="secondary">
          {greeting()}, {membership?.hospitalName}
        </Text>
        <Text variant="display">{user?.firstName}</Text>
        <Text variant="bodySmall" tone="secondary">
          {roles.map(humanize).join(' · ')}
        </Text>
      </View>

      <Row gap={spacing.md} style={{ flexWrap: 'wrap' }}>
        {can('alerts.read') ? <StatTile label="My open alerts" value={workload.data?.assignedOpenAlerts} icon="alert-circle-outline" tone="danger" onPress={() => router.push('/(staff)/alerts')} /> : null}
        {can('discharge.approve') ? <StatTile label="Plans to approve" value={approvals.data?.length} icon="document-text-outline" tone="warning" /> : null}
        {can('checkins.read') ? <StatTile label="Check-ins to review" value={review.data?.meta.total} icon="clipboard-outline" tone="info" onPress={() => router.push('/(staff)/queues/checkins')} /> : null}
        {can('checkins.read') ? <StatTile label="Missed check-ins (7d)" value={missed.data?.meta.total} icon="time-outline" tone="warning" onPress={() => router.push('/(staff)/queues/missed')} /> : null}
        {can('medication.review') ? <StatTile label="Medication concerns" value={concerns.data?.meta.total} icon="medkit-outline" tone="warning" onPress={() => router.push('/(staff)/queues/medications')} /> : null}
        {can('rehabilitation.manage') ? <StatTile label="Sessions upcoming" value={sessions.data?.meta.total} icon="walk-outline" tone="primary" onPress={() => router.push('/(staff)/sessions')} /> : null}
        <StatTile label="My appointments today" value={workload.data?.appointmentsToday} icon="calendar-outline" tone="success" onPress={() => router.push('/(staff)/appointments')} />
      </Row>

      {can('patients.create') ? (
        <Section title="Quick actions">
          <Button title="New discharge onboarding" icon="person-add-outline" onPress={() => router.push('/(staff)/patients/new')} />
        </Section>
      ) : null}

      {can('discharge.approve') && approvals.data?.length ? (
        <Section title="Discharge plans awaiting your approval">
          <Card>
            {approvals.data.map((p) => (
              <ListRow key={p.id} icon="document-text-outline" title={`${p.patientId.firstName} ${p.patientId.lastName}`} subtitle={`${p.patientId.hospitalPatientRef} · submitted ${relativeTime(p.updatedAt)}`} onPress={() => router.push(`/(staff)/discharge/${p.episodeId}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      {can('alerts.read') ? (
        <Section title="Alerts assigned to me" action={<Button title="All alerts" variant="ghost" size="sm" fullWidth={false} onPress={() => router.push('/(staff)/alerts')} />}>
          {myAlerts.data?.items.length ? (
            myAlerts.data.items.slice(0, 3).map((a) => <AlertCard key={a.id} alert={a} />)
          ) : (
            <Card tone="muted">
              <Text variant="bodySmall" tone="secondary">
                {myAlerts.isLoading ? 'Loading…' : 'No open alerts assigned to you.'}
              </Text>
            </Card>
          )}
        </Section>
      ) : null}

      {can('rehabilitation.manage') && sessions.data?.items.length ? (
        <Section title="Upcoming rehabilitation sessions">
          <Card>
            {sessions.data.items.slice(0, 5).map((s) => (
              <ListRow key={s.id} icon="walk-outline" title={fullName(s.patientId as { firstName: string; lastName: string })} subtitle={`${new Date(s.scheduledAt).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })} ${formatTime(s.scheduledAt)} · ${s.location ?? humanize(s.mode)}`} onPress={() => router.push(`/(staff)/rehab/${s.planId}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      {can('reports.read') && dashboard.data ? (
        <Section title="Hospital overview (30 days)" action={<Button title="Details" variant="ghost" size="sm" fullWidth={false} onPress={() => router.push('/(staff)/analytics')} />}>
          <Row gap={spacing.md} style={{ flexWrap: 'wrap' }}>
            <StatTile label="Active programmes" value={dashboard.data.activity.activeEpisodes} icon="pulse-outline" />
            <StatTile label="New discharges" value={dashboard.data.activity.newDischarges} icon="exit-outline" tone="info" />
            <StatTile label="Open alerts" value={dashboard.data.activity.alerts.open} icon="alert-circle-outline" tone="danger" />
            <StatTile label="Check-in completion" value={dashboard.data.activity.checkIns.completionRate != null ? `${dashboard.data.activity.checkIns.completionRate}%` : '–'} icon="clipboard-outline" tone="success" />
          </Row>
        </Section>
      ) : null}

      {!can('alerts.read') && !can('rehabilitation.manage') && !can('reports.read') && !can('checkins.read') ? (
        <EmptyState icon="briefcase-outline" title="You're set up" message="Use the Patients tab to find patients you are assigned to." />
      ) : null}
    </Screen>
  );
}
