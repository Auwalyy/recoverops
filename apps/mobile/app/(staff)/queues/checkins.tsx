import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, ErrorState, Header, LoadingCards, Row, Screen, Text } from '@/components/ui';
import { monitoringApi, monitoringKeys } from '@/features/monitoring/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { fullName, humanize, relativeTime } from '@/utils/format';

/** Daily check-in review queue (patient-reported answers awaiting staff review). */
export default function CheckInReview() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: monitoringKeys.reviewQueue, queryFn: monitoringApi.reviewQueue });
  const review = useMutation({ mutationFn: (id: string) => monitoringApi.reviewCheckIn(id), onSuccess: () => void qc.invalidateQueries({ queryKey: monitoringKeys.reviewQueue }) });
  return (
    <Screen onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Check-in review" subtitle={q.data ? `${q.data.meta.total} awaiting review` : undefined} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="checkmark-done-outline" title="All reviewed" message="New check-ins will appear here." />
      ) : (
        q.data.items.map((c) => {
          const template = typeof c.templateId === 'object' ? c.templateId : undefined;
          const label = (k: string) => template?.questions?.find((x) => x.key === k)?.label ?? humanize(k.toUpperCase());
          return (
            <Card key={c.id} style={{ marginBottom: spacing.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" onPress={() => router.push(`/(staff)/episodes/${c.episodeId}`)}>
                    {fullName(c.patientId)}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {template?.name} · {relativeTime(c.createdAt)}
                    {c.reporterKind === 'CAREGIVER' ? ' · by caregiver' : ''}
                  </Text>
                </View>
                {c.alertIds?.length ? <Badge label="Alert raised" tone="danger" /> : null}
              </Row>
              <View style={{ marginTop: spacing.sm }}>
                {Object.entries(c.answers).map(([k, v]) => (
                  <Text key={k} variant="bodySmall">
                    <Text variant="bodySmall" tone="secondary">
                      {label(k)}:{' '}
                    </Text>
                    {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                  </Text>
                ))}
              </View>
              <Button title="Mark reviewed" size="md" variant="secondary" style={{ marginTop: spacing.md }} loading={review.isPending && review.variables === c.id} onPress={() => review.mutate(c.id)} />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
