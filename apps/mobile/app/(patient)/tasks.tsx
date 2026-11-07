import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Card, EmptyState, ErrorState, Header, LoadingCards, Screen, Section, Text } from '@/components/ui';
import { SyncStatus, TaskRow } from '@/components/patient';
import { MedicationReportSheet } from '@/components/MedicationReportSheet';
import { useCompleteTask, useTodayTasks } from '@/features/recovery/api';
import { offlineCache } from '@/offline/db';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import type { Task } from '@/types/models';
import { ApiError } from '@/services/api/client';

/** Today's activities, grouped by part of the day. Works from cache when offline. */
export default function TodayTasks() {
  const { spacing } = useTheme();
  const userId = useAuth((s) => s.user?.id);
  const { data, isLoading, error, refetch, isRefetching } = useTodayTasks();
  const complete = useCompleteTask();
  const [medTask, setMedTask] = useState<Task | null>(null);
  const [cached, setCached] = useState<{ value: Task[]; updatedAt: number } | null>(null);

  useEffect(() => {
    if (error instanceof ApiError && error.isNetwork && userId) void offlineCache.get<Task[]>(userId, 'tasks-today').then(setCached);
  }, [error, userId]);

  const tasks = data ?? cached?.value ?? [];
  const groups = [
    { title: 'Morning', items: tasks.filter((t) => (t.localTime ?? '00:00') < '12:00') },
    { title: 'Afternoon', items: tasks.filter((t) => (t.localTime ?? '') >= '12:00' && (t.localTime ?? '') < '17:00') },
    { title: 'Evening', items: tasks.filter((t) => (t.localTime ?? '') >= '17:00') },
  ].filter((g) => g.items.length);

  const onTask = (t: Task) => {
    if (t.status !== 'PENDING' && t.status !== 'MISSED') return;
    if (t.type === 'CHECK_IN') router.push({ pathname: '/(patient)/check-in', params: { taskId: t.id, templateId: t.checkInTemplateId ?? '' } });
    else if (t.type === 'MEDICATION') setMedTask(t);
    else if (t.type === 'APPOINTMENT_REMINDER') router.push('/(patient)/appointments');
  };

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Header back title="Today's activities" subtitle={new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })} right={<SyncStatus />} />
      {cached && !data ? (
        <Text variant="caption" tone="secondary" style={{ marginBottom: spacing.md }}>
          Offline — showing your saved schedule from {new Date(cached.updatedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}.
        </Text>
      ) : null}
      {isLoading ? (
        <LoadingCards />
      ) : error && !cached ? (
        <ErrorState message="We couldn't load today's activities." onRetry={() => void refetch()} />
      ) : !tasks.length ? (
        <EmptyState icon="sunny-outline" title="Nothing scheduled today" message="Rest well. Your care team will add activities to your plan when needed." />
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={g.title}>
            <Card>
              {g.items.map((t) => (
                <TaskRow key={t.id} task={t} onPress={() => onTask(t)} onComplete={['CHECK_IN', 'MEDICATION', 'APPOINTMENT_REMINDER'].includes(t.type) ? undefined : () => complete.mutate({ id: t.id, status: 'COMPLETED' })} />
              ))}
            </Card>
          </Section>
        ))
      )}
      <MedicationReportSheet task={medTask} onClose={() => setMedTask(null)} />
    </Screen>
  );
}
