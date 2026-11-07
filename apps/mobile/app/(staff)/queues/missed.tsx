import { Linking } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, EmptyState, ErrorState, Header, ListRow, LoadingCards, Screen } from '@/components/ui';
import { monitoringApi, monitoringKeys } from '@/features/monitoring/api';
import { errorMessage } from '@/services/api/client';
import { formatDateTime, fullName } from '@/utils/format';

/** Missed check-ins in the last 7 days — follow-up queue for coordinators and nurses. */
export default function MissedCheckIns() {
  const q = useQuery({ queryKey: monitoringKeys.missed, queryFn: monitoringApi.missedQueue });
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Missed check-ins" subtitle="Last 7 days" />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="happy-outline" title="No missed check-ins" />
      ) : (
        <Card>
          {q.data.items.map((t) => (
            <ListRow
              key={t.id}
              icon="time-outline"
              title={fullName(t.patientId)}
              subtitle={`Due ${formatDateTime(t.dueAt)}${t.patientId?.phone ? ` · ${t.patientId.phone}` : ''}`}
              onPress={() => router.push(`/(staff)/episodes/${t.episodeId}`)}
              right={t.patientId?.phone ? <Button title="Call" icon="call-outline" size="sm" variant="secondary" fullWidth={false} onPress={() => void Linking.openURL(`tel:${t.patientId.phone}`)} /> : undefined}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
