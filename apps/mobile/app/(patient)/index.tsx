import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Badge, Button, Card, EmptyState, ErrorState, ListRow, LoadingCards, ProgressBar, Row, Screen, Section, Text } from '@/components/ui';
import { EmergencyCard, SyncStatus, TaskRow } from '@/components/patient';
import { SyncIssues } from '@/screens/shared/AccountScreens';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { useCompleteTask, useMyActiveEpisode, useTodayTasks } from '@/features/recovery/api';
import { useAppointments } from '@/features/care/api';
import { offlineCache } from '@/offline/db';
import { episodeStatusTone, formatDateTime, greeting, humanize } from '@/utils/format';
import { useT } from '@/i18n';

/** Patient home: status, today's progress, next activity, check-in, appointment, help. */
export default function PatientHome() {
  const { colors, spacing } = useTheme();
  const t = useT();
  const user = useAuth((s) => s.user);
  const { episode, isLoading: epLoading, error: epError, refetch: refetchEp } = useMyActiveEpisode();
  const tasks = useTodayTasks();
  const appts = useAppointments({ from: new Date().toISOString() }, !!episode);
  const complete = useCompleteTask();

  // Cache today's tasks for offline viewing (approved, low-sensitivity schedule only).
  useEffect(() => {
    if (user && tasks.data) void offlineCache.set(user.id, 'tasks-today', tasks.data).catch(() => undefined);
  }, [user, tasks.data]);

  const list = tasks.data ?? [];
  const doneCount = list.filter((x) => x.status === 'COMPLETED').length;
  const next = list.find((x) => x.status === 'PENDING');
  const checkIn = list.find((x) => x.type === 'CHECK_IN' && x.status === 'PENDING');
  const meds = list.filter((x) => x.type === 'MEDICATION' && x.status === 'PENDING').slice(0, 3);
  const nextAppt = appts.data?.items.find((a) => ['SCHEDULED', 'CONFIRMED'].includes(a.status));

  const refresh = () => {
    void refetchEp();
    void tasks.refetch();
    void appts.refetch();
  };

  return (
    <Screen onRefresh={refresh} refreshing={tasks.isRefetching}>
      <Animated.View entering={FadeInDown.duration(400)}>
        <Row style={{ justifyContent: 'space-between', marginTop: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySmall" tone="secondary">
              {greeting()},
            </Text>
            <Text variant="display">{user?.firstName ?? ''}</Text>
          </View>
          <Button title="" icon="notifications-outline" variant="outline" size="sm" fullWidth={false} accessibilityLabel="Notifications" onPress={() => router.push('/(patient)/notifications')} style={{ width: 48, height: 48, paddingHorizontal: 0 }} />
        </Row>
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <SyncStatus />
          <SyncIssues />
        </View>
      </Animated.View>

      {epLoading ? (
        <View style={{ marginTop: spacing.xl }}>
          <LoadingCards count={3} />
        </View>
      ) : epError ? (
        <ErrorState message="We couldn't load your recovery programme." onRetry={refresh} />
      ) : !episode ? (
        <EmptyState icon="leaf-outline" title="No active recovery programme" message="When your care team activates your recovery plan, it will appear here." />
      ) : (
        <>
          {/* Recovery status + today's progress */}
          <Card tone="primary" style={{ marginTop: spacing.xl }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {episode.programmeName ?? 'Recovery programme'}
              </Text>
              <Badge label={humanize(episode.status)} tone={episodeStatusTone(episode.status)} />
            </Row>
            <Text variant="title" style={{ color: '#FFFFFF', marginTop: spacing.sm }}>
              {t('home.today')}
            </Text>
            <Text variant="bodySmall" style={{ color: 'rgba(255,255,255,0.85)', marginBottom: spacing.md }}>
              {list.length ? `${doneCount} of ${list.length} activities done` : 'No activities scheduled today'}
            </Text>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8 }}>
              <ProgressBar value={list.length ? doneCount / list.length : 0} tone="success" />
            </View>
          </Card>

          {/* Next activity */}
          {next ? (
            <Section title={t('home.next')}>
              <Card>
                <TaskRow
                  task={next}
                  onPress={() => router.push(next.type === 'CHECK_IN' ? '/(patient)/check-in' : '/(patient)/tasks')}
                  onComplete={next.type === 'CHECK_IN' || next.type === 'MEDICATION' ? undefined : () => complete.mutate({ id: next.id, status: 'COMPLETED' })}
                />
              </Card>
            </Section>
          ) : null}

          {/* Pending check-in */}
          {checkIn ? (
            <Section title={t('home.checkin')}>
              <Card>
                <Row gap={spacing.md}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="clipboard-outline" size={24} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">How are you feeling today?</Text>
                    <Text variant="bodySmall" tone="secondary">
                      Takes about two minutes
                    </Text>
                  </View>
                </Row>
                <Button title={t('home.checkinCta')} style={{ marginTop: spacing.lg }} onPress={() => router.push({ pathname: '/(patient)/check-in', params: { taskId: checkIn.id, templateId: checkIn.checkInTemplateId ?? '' } })} />
              </Card>
            </Section>
          ) : null}

          {/* Medication reminders */}
          <Section title="Medicines today" action={<Button title="All medicines" variant="ghost" size="sm" fullWidth={false} onPress={() => router.push('/(patient)/medications')} />}>
            <Card>
              {meds.length ? (
                meds.map((m) => <TaskRow key={m.id} task={m} onPress={() => router.push('/(patient)/tasks')} />)
              ) : (
                <Row gap={spacing.md} style={{ paddingVertical: spacing.sm }}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  <Text variant="body" tone="secondary">
                    No medicine reminders left today.
                  </Text>
                </Row>
              )}
            </Card>
          </Section>

          {/* Next appointment */}
          <Section title="Next appointment">
            {nextAppt ? (
              <Card onPress={() => router.push(`/(patient)/appointments/${nextAppt.id}`)} accessibilityLabel="Open next appointment">
                <ListRow icon="calendar-outline" title={humanize(nextAppt.type)} subtitle={`${formatDateTime(nextAppt.scheduledAt)}${nextAppt.location ? ` · ${nextAppt.location}` : ''}`} right={nextAppt.status === 'CONFIRMED' ? <Badge label="Confirmed" tone="success" /> : undefined} />
              </Card>
            ) : (
              <Card tone="muted">
                <Text variant="bodySmall" tone="secondary">
                  No upcoming appointments.
                </Text>
              </Card>
            )}
          </Section>

          {/* Quick actions */}
          <Section title="Quick actions">
            <Card>
              <ListRow icon="list-outline" title="Today's activities" onPress={() => router.push('/(patient)/tasks')} />
              <ListRow icon="thermometer-outline" title={t('home.reportSymptom')} iconBg={colors.warningSoft} iconColor={colors.warning} onPress={() => router.push('/(patient)/symptom')} />
              <ListRow icon="walk-outline" title="Rehabilitation" onPress={() => router.push('/(patient)/rehabilitation')} />
              <ListRow icon="folder-open-outline" title="Discharge documents" onPress={() => router.push('/(patient)/documents')} />
            </Card>
          </Section>
        </>
      )}

      {/* Help is always visible */}
      <Section title={t('home.help')}>
        <View style={{ gap: spacing.md }}>
          <Button title={t('home.contact')} icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => router.push('/(patient)/messages/new')} />
          <EmergencyCard compact />
        </View>
      </Section>
    </Screen>
  );
}
