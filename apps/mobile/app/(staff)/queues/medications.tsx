import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, EmptyState, ErrorState, Header, LoadingCards, Row, Screen, Text, TextField } from '@/components/ui';
import { monitoringApi, monitoringKeys } from '@/features/monitoring/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { fullName, humanize, medicationEventLabel, relativeTime } from '@/utils/format';

/** Pharmacist review queue: access problems, side effects, review requests. */
export default function MedicationConcerns() {
  const { spacing } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: monitoringKeys.concerns, queryFn: monitoringApi.concerns });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const review = useMutation({ mutationFn: (id: string) => monitoringApi.reviewConcern(id, notes[id]), onSuccess: () => void qc.invalidateQueries({ queryKey: monitoringKeys.concerns }) });
  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title="Medication concerns" subtitle="Patient-reported — pharmacist review" />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon="medkit-outline" title="No open concerns" />
      ) : (
        q.data.items.map((e) => {
          const med = typeof e.medicationOrderId === 'object' ? e.medicationOrderId : undefined;
          return (
            <Card key={e.id} style={{ marginBottom: spacing.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">{med ? `${med.name}${med.strength ? ` ${med.strength}` : ''}` : 'Medication'}</Text>
                  <Text variant="caption" tone="secondary" onPress={() => e.patientId && router.push(`/(staff)/patients/${e.patientId.id}`)}>
                    {fullName(e.patientId)} · {relativeTime(e.createdAt)}
                  </Text>
                </View>
                <Badge label={medicationEventLabel(e.status)} tone="warning" />
              </Row>
              {e.accessProblem ? <Text variant="bodySmall" style={{ marginTop: spacing.sm }}>Access problem: {humanize(e.accessProblem)}</Text> : null}
              {e.sideEffects ? <Text variant="bodySmall" style={{ marginTop: 4 }}>Side effects (reported): {e.sideEffects}</Text> : null}
              {e.reason ? <Text variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>“{e.reason}”</Text> : null}
              <View style={{ marginTop: spacing.md }}>
                <TextField label="Review notes" value={notes[e.id] ?? ''} onChangeText={(t) => setNotes({ ...notes, [e.id]: t })} multiline />
                <Button title="Complete review" size="md" loading={review.isPending && review.variables === e.id} onPress={() => review.mutate(e.id)} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
