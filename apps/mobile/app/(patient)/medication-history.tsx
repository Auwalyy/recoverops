import { useQuery } from '@tanstack/react-query';
import { Badge, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, Screen, Text } from '@/components/ui';
import { recoveryApi, recoveryKeys, useMyActiveEpisode } from '@/features/recovery/api';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDateTime, medicationEventLabel } from '@/utils/format';

const tone = (s: string) => (s === 'REPORTED_TAKEN' ? 'success' : s === 'REPORTED_DELAYED' ? 'info' : s === 'NOT_RESPONDED' ? 'neutral' : 'warning');

/** History of patient/caregiver-REPORTED dose events (never shown as verified). */
export default function MedicationHistory() {
  const { spacing } = useTheme();
  const { episode } = useMyActiveEpisode();
  const q = useQuery({ queryKey: recoveryKeys.medicationEvents(episode?.id ?? ''), queryFn: () => recoveryApi.medicationEvents(episode!.id), enabled: !!episode });

  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Medicine history" subtitle="What you reported to your care team" />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="time-outline" title="No reports yet" message="When you mark a dose as taken or missed, it will show here." />
      ) : (
        <Card>
          {q.data.items.map((e) => {
            const med = typeof e.medicationOrderId === 'object' ? e.medicationOrderId : null;
            return (
              <ListRow
                key={e.id}
                icon="medkit-outline"
                title={med ? `${med.name}${med.strength ? ` ${med.strength}` : ''}` : 'Medicine'}
                subtitle={`${formatDateTime(e.scheduledFor ?? e.createdAt)}${e.reporterKind === 'CAREGIVER' ? ' · by caregiver' : ''}`}
                right={<Badge label={medicationEventLabel(e.status)} tone={tone(e.status)} />}
              />
            );
          })}
        </Card>
      )}
      <Text variant="caption" tone="secondary" align="center" style={{ marginTop: spacing.lg }}>
        These are reports, not a record that a dose was given.
      </Text>
    </Screen>
  );
}
