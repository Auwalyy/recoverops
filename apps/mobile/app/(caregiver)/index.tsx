import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, ListRow, LoadingCards, ProgressBar, Row, Screen, Section, Text } from '@/components/ui';
import { EmergencyCard, SyncStatus, TaskRow } from '@/components/patient';
import { MedicationReportSheet } from '@/components/MedicationReportSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, useAuth } from '@/store/auth';
import { careApi, careKeys, useAppointments } from '@/features/care/api';
import { useMyActiveEpisode, useTodayTasks } from '@/features/recovery/api';
import { formatDateTime, greeting, humanize } from '@/utils/format';
import type { Task } from '@/types/models';

/**
 * Caregiver dashboard: the linked patient and ONLY the information they consented to.
 * Sections without consent are simply not requested (and the API would refuse them).
 */
export default function CaregiverHome() {
  const { spacing } = useTheme();
  const user = useAuth((s) => s.user);
  const can = (p: string) => hasPermission(user, p);
  const grants = useQuery({ queryKey: careKeys.myGrants, queryFn: careApi.myGrants });
  const { episode, isLoading } = useMyActiveEpisode(can('recovery.read') || can('appointments.read'));
  const tasks = useTodayTasks(can('recovery.read') || can('medication.read'));
  const appts = useAppointments({ from: new Date().toISOString() }, can('appointments.read'));
  const [medTask, setMedTask] = useState<Task | null>(null);
  const patient = grants.data?.[0]?.patient;
  const list = tasks.data ?? [];
  const done = list.filter((t) => t.status === 'COMPLETED').length;
  const nextAppt = appts.data?.items.find((a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status));

  return (
    <Screen onRefresh={() => { void grants.refetch(); void tasks.refetch(); void appts.refetch(); }} refreshing={grants.isRefetching}>
      <View style={{ marginTop: spacing.sm }}>
        <Text variant="bodySmall" tone="secondary">
          {greeting()}, {user?.firstName}
        </Text>
        <Text variant="title">You're supporting</Text>
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <SyncStatus />
      </View>
      {grants.isLoading ? (
        <LoadingCards count={2} />
      ) : grants.error ? (
        <ErrorState onRetry={() => void grants.refetch()} />
      ) : !patient ? (
        <EmptyState icon="people-outline" title="No active access" message="The patient's permission may have expired or been withdrawn." />
      ) : (
        <>
          <Card style={{ marginTop: spacing.lg }}>
            <Row gap={spacing.md}>
              <Avatar name={`${patient.firstName} ${patient.lastName}`} size={52} />
              <View style={{ flex: 1 }}>
                <Text variant="heading">
                  {patient.firstName} {patient.lastName}
                </Text>
                {episode ? <Badge label={humanize(episode.status)} tone="success" /> : null}
              </View>
            </Row>
            <Button title="What I can see" icon="shield-checkmark-outline" variant="ghost" size="sm" fullWidth={false} style={{ marginTop: spacing.sm }} onPress={() => router.push('/(caregiver)/profile')} />
          </Card>

          {can('recovery.read') || can('medication.read') ? (
            <Section title="Today">
              <Card>
                {isLoading || tasks.isLoading ? (
                  <LoadingCards count={1} />
                ) : list.length ? (
                  <>
                    <Text variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
                      {done} of {list.length} activities reported done
                    </Text>
                    <ProgressBar value={done / list.length} tone="success" />
                    {list.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onPress={() => {
                          if (t.status !== 'PENDING') return;
                          if (t.type === 'MEDICATION' && can('checkins.create')) setMedTask(t);
                          else if (t.type === 'CHECK_IN' && can('checkins.create')) router.push({ pathname: '/(caregiver)/check-in', params: { taskId: t.id, templateId: t.checkInTemplateId ?? '' } });
                        }}
                      />
                    ))}
                  </>
                ) : (
                  <Text variant="bodySmall" tone="secondary">
                    No activities you can see today.
                  </Text>
                )}
              </Card>
            </Section>
          ) : null}

          {can('appointments.read') ? (
            <Section title="Next appointment">
              <Card>
                {nextAppt ? (
                  <ListRow icon="calendar-outline" title={humanize(nextAppt.type)} subtitle={`${formatDateTime(nextAppt.scheduledAt)}${nextAppt.location ? ` · ${nextAppt.location}` : ''}`} onPress={() => router.push(`/(caregiver)/appointments/${nextAppt.id}`)} />
                ) : (
                  <Text variant="bodySmall" tone="secondary">
                    No upcoming appointments.
                  </Text>
                )}
              </Card>
            </Section>
          ) : null}

          <Section title="Help the patient">
            <Card>
              {can('medication.read') ? <ListRow icon="medkit-outline" title="Medicines" subtitle="As prescribed" onPress={() => router.push('/(caregiver)/medications')} /> : null}
              {can('checkins.create') ? <ListRow icon="clipboard-outline" title="Do today's check-in with them" onPress={() => router.push('/(caregiver)/check-in')} /> : null}
              {can('messages.send') ? <ListRow icon="chatbubble-ellipses-outline" title="Message the care team" onPress={() => router.push('/(caregiver)/messages/new')} /> : null}
              <ListRow icon="help-buoy-outline" title="Help & emergency" onPress={() => router.push('/(caregiver)/help')} />
            </Card>
          </Section>
        </>
      )}
      <Section title="In an emergency">
        <EmergencyCard compact />
      </Section>
      <MedicationReportSheet task={medTask} onClose={() => setMedTask(null)} />
    </Screen>
  );
}
