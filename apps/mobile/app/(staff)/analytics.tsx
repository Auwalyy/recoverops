import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, Header, ListRow, LoadingCards, ProgressBar, Row, Screen, Section, Text } from '@/components/ui';
import { StatTile } from '@/components/staff';
import { careApi, careKeys } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { formatDate } from '@/utils/format';

const pct = (v: number | null) => (v == null ? '–' : `${v}%`);

/** Hospital dashboard: platform ACTIVITY metrics shown separately from clinical OUTCOMES. */
export default function Analytics() {
  const { spacing } = useTheme();
  const q = useQuery({ queryKey: careKeys.dashboard, queryFn: careApi.dashboard });
  const d = q.data;
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Recovery analytics" subtitle={d ? `${formatDate(d.period.from)} – ${formatDate(d.period.to)}` : undefined} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error || !d ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Text variant="caption" tone="secondary">
            {d.activity.label}
          </Text>
          <Row gap={spacing.md} style={{ flexWrap: 'wrap', marginTop: spacing.md }}>
            <StatTile label="Active programmes" value={d.activity.activeEpisodes} icon="pulse-outline" />
            <StatTile label="New discharges" value={d.activity.newDischarges} icon="exit-outline" tone="info" />
            <StatTile label="Open alerts" value={d.activity.alerts.open} icon="alert-circle-outline" tone="danger" />
            <StatTile label="Escalated alerts" value={d.activity.alerts.escalated} icon="trending-up-outline" tone="warning" />
          </Row>
          <Section title="Engagement & responsiveness">
            <Card>
              {[
                ['Patient engagement (activities reported done)', d.activity.patientEngagementRate],
                ['Check-in completion', d.activity.checkIns.completionRate],
                ['Appointment attendance', d.activity.appointments.attendanceRate],
                ['Rehabilitation attendance', d.activity.rehabilitation.attendanceRate],
              ].map(([label, v]) => (
                <View key={String(label)} style={{ paddingVertical: spacing.sm }}>
                  <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text variant="bodySmall">{label}</Text>
                    <Text variant="label">{pct(v as number | null)}</Text>
                  </Row>
                  <ProgressBar value={((v as number | null) ?? 0) / 100} />
                </View>
              ))}
              <ListRow icon="time-outline" title={d.activity.alerts.avgAcknowledgeMinutes != null ? `${d.activity.alerts.avgAcknowledgeMinutes} min` : '–'} subtitle="Average time to acknowledge alerts" />
              <ListRow icon="checkmark-done-outline" title={d.activity.alerts.avgResolveMinutes != null ? `${d.activity.alerts.avgResolveMinutes} min` : '–'} subtitle="Average time to resolve alerts" />
              <ListRow icon="calendar-outline" title={`${d.activity.appointments.missed}`} subtitle="Missed appointments" />
              <ListRow icon="clipboard-outline" title={`${d.activity.checkIns.missed}`} subtitle="Missed check-ins" />
              <ListRow icon="happy-outline" title={d.activity.satisfaction.average != null ? `${d.activity.satisfaction.average} / 5` : '–'} subtitle={`Patient satisfaction (${d.activity.satisfaction.responses} responses)`} />
            </Card>
          </Section>
          <Section title="Clinical outcomes">
            <Card>
              <Text variant="caption" tone="secondary" style={{ marginBottom: spacing.sm }}>
                {d.outcomes.label}
              </Text>
              <ListRow icon="ribbon-outline" title={`${d.outcomes.programmesCompleted}`} subtitle="Recovery programmes completed" />
              <ListRow icon="git-branch-outline" title={`${d.outcomes.programmesTransferred}`} subtitle="Transferred to another pathway" />
              <ListRow icon="information-circle-outline" title="Unplanned hospital returns" subtitle={d.outcomes.unplannedHospitalReturnsNote} />
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
