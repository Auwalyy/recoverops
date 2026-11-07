import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, ErrorState, Header, LoadingCards, Row, Screen, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useMedications, useMyActiveEpisode } from '@/features/recovery/api';
import { formatDate, humanize } from '@/utils/format';

/** Medication schedule — exactly as prescribed in the approved plan. Read-only. */
export default function Medications() {
  const { colors, spacing } = useTheme();
  const { episode, isLoading: epLoading } = useMyActiveEpisode();
  const meds = useMedications(episode?.id);

  return (
    <Screen onRefresh={() => void meds.refetch()} refreshing={meds.isRefetching}>
      <Header back title="My medicines" subtitle="As prescribed by your care team" />
      {epLoading || meds.isLoading ? (
        <LoadingCards />
      ) : meds.error ? (
        <ErrorState message="We couldn't load your medicines." onRetry={() => void meds.refetch()} />
      ) : !meds.data?.length ? (
        <EmptyState icon="medkit-outline" title="No medicines" message="Your approved plan has no medicines listed." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {meds.data.map((m) => (
            <Card key={m.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="heading">
                    {m.name}
                    {m.strength ? ` ${m.strength}` : ''}
                  </Text>
                  <Text variant="body" style={{ marginTop: 2 }}>
                    {m.dose} · {humanize(m.route)}
                  </Text>
                </View>
                {m.isPrn ? <Badge label="When needed" tone="info" /> : null}
              </Row>
              <Text variant="bodySmall" tone="secondary" style={{ marginTop: spacing.sm }}>
                {m.frequencyText}
              </Text>
              {m.schedule && !m.isPrn ? (
                <Row gap={6} style={{ flexWrap: 'wrap', marginTop: spacing.md }}>
                  <Ionicons name="alarm-outline" size={16} color={colors.primary} />
                  {m.schedule.timesOfDay.map((t) => (
                    <Badge key={t} label={t} tone="primary" />
                  ))}
                </Row>
              ) : null}
              {m.instructions ? (
                <Text variant="bodySmall" style={{ marginTop: spacing.md }}>
                  {m.instructions}
                </Text>
              ) : null}
              <Text variant="caption" tone="secondary" style={{ marginTop: spacing.md }}>
                {formatDate(m.startDate)}
                {m.endDate ? ` – ${formatDate(m.endDate)}` : ''}
              </Text>
            </Card>
          ))}
          <Card tone="muted">
            <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} />
              <Text variant="bodySmall" tone="secondary" style={{ flex: 1 }}>
                Do not change how you take your medicines without speaking to your care team. RecoverOS reminders follow your prescription exactly.
              </Text>
            </Row>
          </Card>
          <Button title="My medicine history" icon="time-outline" variant="outline" onPress={() => router.push('/(patient)/medication-history')} />
        </View>
      )}
    </Screen>
  );
}
