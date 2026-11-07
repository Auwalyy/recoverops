import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, Header, LoadingCards, Screen } from '@/components/ui';
import { CheckInForm } from '@/components/CheckInForm';
import { EmergencyCard } from '@/components/patient';
import { monitoringApi, monitoringKeys, useTemplates } from '@/features/monitoring/api';
import { useMyActiveEpisode, useTodayTasks } from '@/features/recovery/api';
import { useTheme } from '@/theme/ThemeProvider';
import { View } from 'react-native';

/** Daily check-in (patients and caregivers with check-in permission). */
export function CheckInScreen() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ taskId?: string; templateId?: string }>();
  const { episode, isLoading: epLoading } = useMyActiveEpisode();
  const today = useTodayTasks();
  const templates = useTemplates();
  const taskTemplate = today.data?.find((t) => t.type === 'CHECK_IN' && t.status === 'PENDING');
  const templateId = params.templateId || taskTemplate?.checkInTemplateId || templates.data?.[0]?.id;
  const template = useQuery({ queryKey: monitoringKeys.template(templateId ?? ''), queryFn: () => monitoringApi.template(templateId!), enabled: !!templateId });

  return (
    <Screen keyboard>
      <Header back title="Daily check-in" subtitle="Your answers go to your care team. This is not an emergency service." />
      {epLoading || template.isLoading || templates.isLoading ? (
        <LoadingCards count={4} />
      ) : !episode ? (
        <EmptyState title="No active programme" message="Check-ins start when your recovery programme is active." />
      ) : template.error || !template.data ? (
        <ErrorState message="This check-in form is not available right now." onRetry={() => void template.refetch()} />
      ) : (
        <CheckInForm template={template.data} episodeId={episode.id} taskId={params.taskId || taskTemplate?.id} onDone={() => router.back()} />
      )}
      <View style={{ marginTop: spacing.xl }}>
        <EmergencyCard />
      </View>
    </Screen>
  );
}
