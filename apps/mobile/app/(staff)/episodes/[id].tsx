import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EPISODE_CLINICAL_DECISION_STATUSES, EPISODE_TRANSITIONS, type EpisodeStatus } from '@recoveros/shared';
import { Badge, Banner, Button, Card, ChoiceChips, ErrorState, Header, ListRow, LoadingCards, ProgressBar, Row, Screen, Section, Text, TextField } from '@/components/ui';
import { AlertCard } from '@/components/staff';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, useAuth } from '@/store/auth';
import { recoveryApi, recoveryKeys, useEpisode, useMedications } from '@/features/recovery/api';
import { monitoringApi, monitoringKeys, useAlerts } from '@/features/monitoring/api';
import { careApi } from '@/features/care/api';
import { errorMessage } from '@/services/api/client';
import { episodeStatusTone, formatDate, formatDateTime, fullName, humanize, relativeTime } from '@/utils/format';

type Tab = 'timeline' | 'checkins' | 'symptoms' | 'alerts' | 'medications' | 'team';

function TransitionPanel({ episodeId, status, onDone }: { episodeId: string; status: EpisodeStatus; onDone: () => void }) {
  const { spacing } = useTheme();
  const user = useAuth((s) => s.user);
  const canApprove = hasPermission(user, 'recovery.approve');
  const options = EPISODE_TRANSITIONS[status].filter((s) => !['NEEDS_ATTENTION', 'DISCHARGE_PENDING', 'DRAFT'].includes(s) && (canApprove || !EPISODE_CLINICAL_DECISION_STATUSES.includes(s)));
  const [to, setTo] = useState<EpisodeStatus | undefined>(options[0]);
  const [reason, setReason] = useState('');
  const [extend, setExtend] = useState('');
  const [destination, setDestination] = useState('');
  const m = useMutation({
    mutationFn: () =>
      recoveryApi.transition(episodeId, {
        toStatus: to!,
        reason: reason.trim(),
        extendedReviewDate: extend || undefined,
        transfer: to === 'TRANSFERRED' ? { destination: destination.trim(), destinationType: 'OTHER_PATHWAY' } : undefined,
      }),
    onSuccess: onDone,
  });
  if (!options.length) return <Text variant="bodySmall" tone="secondary">No status changes are available to you for this episode.</Text>;
  return (
    <View>
      <ChoiceChips label="New status" value={to} onChange={setTo} options={options.map((o) => ({ value: o, label: o === 'ACTIVE' && status !== 'ACTIVE' ? 'Resume / extend' : humanize(o) }))} />
      <View style={{ height: spacing.lg }} />
      <TextField label="Reason (recorded in the audit trail)" value={reason} onChangeText={setReason} multiline />
      {to === 'ACTIVE' || to === 'UNDER_REVIEW' ? <TextField label="New expected review date (optional)" value={extend} onChangeText={setExtend} placeholder="YYYY-MM-DD" /> : null}
      {to === 'TRANSFERRED' ? <TextField label="Transferred to" value={destination} onChangeText={setDestination} placeholder="e.g. Primary health centre, Fagge" /> : null}
      {m.error ? <Banner tone="danger" title="Could not change status" message={errorMessage(m.error)} /> : null}
      <Button title={`Confirm: ${to ? humanize(to) : ''}`} style={{ marginTop: spacing.md }} disabled={!to || reason.trim().length < 3 || (to === 'TRANSFERRED' && !destination.trim())} loading={m.isPending} onPress={() => m.mutate()} />
    </View>
  );
}

function AiSummary({ episodeId }: { episodeId: string }) {
  const { colors, spacing } = useTheme();
  const summary = useMutation({ mutationFn: () => monitoringApi.summarise(episodeId, 7) });
  const insights = useQuery({ queryKey: ['insights', episodeId], queryFn: () => monitoringApi.insights(episodeId) });
  const s = summary.data;
  return (
    <Card>
      {insights.data?.insights.length ? (
        <View style={{ marginBottom: spacing.md }}>
          <Text variant="label">Operational observations</Text>
          {insights.data.insights.map((i) => (
            <Row key={i.code} gap={8} style={{ marginTop: 6, alignItems: 'flex-start' }}>
              <Ionicons name="trending-up-outline" size={16} color={colors.warning} />
              <Text variant="bodySmall" style={{ flex: 1 }}>
                {i.message}
              </Text>
            </Row>
          ))}
          <Text variant="caption" tone="secondary" style={{ marginTop: 6 }}>
            {insights.data.disclaimer}
          </Text>
        </View>
      ) : null}
      {s ? (
        <View>
          <Row gap={6}>
            <Ionicons name={s.aiAssisted ? 'sparkles-outline' : 'list-outline'} size={16} color={colors.info} />
            <Text variant="caption" style={{ color: colors.info }}>
              {s.aiAssisted ? 'AI-generated summary' : 'Structured summary'} · {formatDate(s.facts.reportingPeriod.from)} – {formatDate(s.facts.reportingPeriod.to)}
            </Text>
          </Row>
          <Text variant="body" style={{ marginTop: spacing.sm }}>
            {String(s.summary.overview ?? '')}
          </Text>
          {(['reportedSymptoms', 'missedActivities', 'medicationConcerns', 'outstandingAppointments', 'openAlerts', 'itemsRequiringReview'] as const).map((k) =>
            Array.isArray(s.summary[k]) && (s.summary[k] as string[]).length ? (
              <View key={k} style={{ marginTop: spacing.sm }}>
                <Text variant="label">{humanize(k.replace(/([A-Z])/g, '_$1').toUpperCase())}</Text>
                {(s.summary[k] as string[]).map((line, i) => (
                  <Text key={i} variant="bodySmall">
                    • {line}
                  </Text>
                ))}
              </View>
            ) : null,
          )}
          <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
            {s.label ?? s.fallbackReason ?? 'Built directly from recorded data.'}
          </Text>
        </View>
      ) : (
        <Button title="Summarise last 7 days" icon="sparkles-outline" variant="secondary" loading={summary.isPending} onPress={() => summary.mutate()} />
      )}
      {summary.error ? <Text variant="caption" tone="danger" style={{ marginTop: spacing.sm }}>{errorMessage(summary.error)}</Text> : null}
    </Card>
  );
}

export default function EpisodeDetail() {
  const { spacing } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const can = (p: string) => hasPermission(user, p);
  const q = useEpisode(id);
  const [tab, setTab] = useState<Tab>('timeline');
  const [transitioning, setTransitioning] = useState(false);
  const checkIns = useQuery({ queryKey: monitoringKeys.checkIns(id), queryFn: () => monitoringApi.checkIns(id), enabled: tab === 'checkins' && can('checkins.read') });
  const symptoms = useQuery({ queryKey: monitoringKeys.symptoms({ episodeId: id }), queryFn: () => monitoringApi.symptoms({ episodeId: id }), enabled: tab === 'symptoms' && can('checkins.read') });
  const alerts = useAlerts({ episodeId: id }, tab === 'alerts' && can('alerts.read'));
  const meds = useMedications(tab === 'medications' && can('medication.read') ? id : undefined);
  const reviewCheckIn = useMutation({ mutationFn: (cid: string) => monitoringApi.reviewCheckIn(cid), onSuccess: () => void qc.invalidateQueries({ queryKey: monitoringKeys.checkIns(id) }) });

  const d = q.data;
  const ep = d?.episode;
  const patient = ep && typeof ep.patientId === 'object' ? ep.patientId : undefined;
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'timeline', label: 'Timeline' },
    ...(can('checkins.read') ? [{ value: 'checkins' as const, label: 'Check-ins' }, { value: 'symptoms' as const, label: 'Symptoms' }] : []),
    ...(can('alerts.read') ? [{ value: 'alerts' as const, label: 'Alerts' }] : []),
    ...(can('medication.read') ? [{ value: 'medications' as const, label: 'Medicines' }] : []),
    { value: 'team', label: 'Care team' },
  ];

  return (
    <Screen keyboard onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <Header back title={fullName(patient) || 'Episode'} subtitle={patient?.hospitalPatientRef} />
      {q.isLoading ? (
        <LoadingCards />
      ) : q.error || !ep || !d ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="overline" tone="secondary">
                {typeof ep.departmentId === 'object' ? ep.departmentId.name : 'Episode'}
              </Text>
              <Badge label={humanize(ep.status)} tone={episodeStatusTone(ep.status)} />
            </Row>
            <Text variant="heading" style={{ marginTop: 4 }}>
              {ep.programmeName ?? ep.procedureReference ?? 'Recovery programme'}
            </Text>
            <Text variant="bodySmall" tone="secondary">
              Admitted {formatDate(ep.admissionDate)}
              {ep.dischargeDate ? ` · Discharged ${formatDate(ep.dischargeDate)}` : ''}
              {ep.expectedReviewDate ? ` · Review ${formatDate(ep.expectedReviewDate)}` : ''}
            </Text>
            {d.today.total ? (
              <View style={{ marginTop: spacing.md }}>
                <Text variant="caption" tone="secondary" style={{ marginBottom: 6 }}>
                  Today: {d.today.completed}/{d.today.total} activities reported done{d.today.missed ? ` · ${d.today.missed} missed` : ''}
                </Text>
                <ProgressBar value={d.today.completed / d.today.total} tone="success" />
              </View>
            ) : null}
            {ep.stats?.lastCheckInAt ? (
              <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
                Last check-in {relativeTime(ep.stats.lastCheckInAt)}
              </Text>
            ) : null}
          </Card>

          <Section title="Actions">
            <Card>
              <ListRow icon="document-text-outline" title="Discharge plan" subtitle={ep.status === 'DRAFT' || ep.status === 'DISCHARGE_PENDING' ? 'Draft / approval' : 'Approved plan & versions'} onPress={() => router.push(`/(staff)/discharge/${ep.id}`)} />
              {can('appointments.manage') ? <ListRow icon="calendar-outline" title="Book appointment" onPress={() => router.push({ pathname: '/(staff)/appointments-new', params: { episodeId: ep.id } })} /> : null}
              {can('rehabilitation.read') ? <ListRow icon="walk-outline" title="Rehabilitation" onPress={() => router.push({ pathname: '/(staff)/rehab/[planId]', params: { planId: 'episode', episodeId: ep.id } })} /> : null}
              {patient?.phone ? <ListRow icon="call-outline" title="Call patient" subtitle={patient.phone} onPress={() => void Linking.openURL(`tel:${patient.phone}`)} /> : null}
              {can('messages.send') ? (
                <ListRow icon="chatbubble-outline" title="Message patient" onPress={() => void careApi.createConversation({ subject: 'Recovery follow-up', category: 'GENERAL', initialMessage: 'Hello, this is your care team checking in on your recovery.', patientId: patient?.id }).then((r) => router.push(`/(staff)/messages/${r.conversation.id}`))} />
              ) : null}
              {can('recovery.update') ? <ListRow icon="swap-horizontal-outline" title="Change programme status" subtitle="Complete, extend, hold or transfer" onPress={() => setTransitioning((x) => !x)} /> : null}
            </Card>
            {transitioning ? (
              <Card style={{ marginTop: spacing.md }}>
                <TransitionPanel
                  episodeId={ep.id}
                  status={ep.status}
                  onDone={() => {
                    setTransitioning(false);
                    void qc.invalidateQueries({ queryKey: recoveryKeys.episode(id) });
                    void qc.invalidateQueries({ queryKey: ['episodes'] });
                  }}
                />
              </Card>
            ) : null}
          </Section>

          {can('ai.use') && can('checkins.read') ? (
            <Section title="Recovery summary">
              <AiSummary episodeId={ep.id} />
            </Section>
          ) : null}

          <Section title="Details">
            <ChoiceChips label="Episode section" value={tab} onChange={setTab} options={tabs} />
            <View style={{ marginTop: spacing.md }}>
              {tab === 'timeline' ? (
                <Card>
                  {(ep.statusHistory ?? []).slice().reverse().map((h, i) => (
                    <ListRow key={i} icon={h.changedBySystem ? 'hardware-chip-outline' : 'person-outline'} title={humanize(h.to)} subtitle={`${formatDateTime(h.at)}${h.reason ? ` · ${h.reason}` : ''}`} />
                  ))}
                </Card>
              ) : tab === 'checkins' ? (
                <Card>
                  {checkIns.isLoading ? <LoadingCards count={1} /> : !checkIns.data?.items.length ? <Text variant="bodySmall" tone="secondary">No check-ins yet.</Text> : (
                    checkIns.data.items.map((c) => (
                      <View key={c.id} style={{ paddingVertical: spacing.md }}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Text variant="label">{formatDateTime(c.createdAt)}{c.reporterKind === 'CAREGIVER' ? ' · caregiver' : ''}</Text>
                          {c.reviewStatus === 'PENDING_REVIEW' ? <Button title="Mark reviewed" size="sm" variant="ghost" fullWidth={false} onPress={() => reviewCheckIn.mutate(c.id)} /> : <Badge label="Reviewed" tone="success" />}
                        </Row>
                        {Object.entries(c.answers).map(([k, v]) => (
                          <Text key={k} variant="bodySmall" tone="secondary">
                            {humanize(k.toUpperCase())}: <Text variant="bodySmall">{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</Text>
                          </Text>
                        ))}
                        {c.alertIds?.length ? <Badge label="Triggered alert" tone="danger" icon="alert-circle" /> : null}
                      </View>
                    ))
                  )}
                  <Text variant="caption" tone="secondary">Patient-reported information.</Text>
                </Card>
              ) : tab === 'symptoms' ? (
                <Card>
                  {!symptoms.data?.items.length ? <Text variant="bodySmall" tone="secondary">{symptoms.isLoading ? 'Loading…' : 'No symptom reports.'}</Text> : symptoms.data.items.map((s) => (
                    <ListRow key={s.id} icon="thermometer-outline" title={s.description} subtitle={`${humanize(s.severity)} · ${humanize(s.trend)} · ${relativeTime(s.createdAt)}`} right={s.reviewStatus === 'PENDING_REVIEW' ? <Badge label="New" tone="warning" /> : undefined} />
                  ))}
                </Card>
              ) : tab === 'alerts' ? (
                alerts.data?.items.length ? alerts.data.items.map((a) => <AlertCard key={a.id} alert={a} />) : <Card><Text variant="bodySmall" tone="secondary">{alerts.isLoading ? 'Loading…' : 'No alerts for this episode.'}</Text></Card>
              ) : tab === 'medications' ? (
                <Card>
                  {!meds.data?.length ? <Text variant="bodySmall" tone="secondary">{meds.isLoading ? 'Loading…' : 'No active medication orders.'}</Text> : meds.data.map((m) => (
                    <ListRow key={m.id} icon="medkit-outline" title={`${m.name}${m.strength ? ` ${m.strength}` : ''} — ${m.dose}`} subtitle={`${m.frequencyText}${m.isPrn ? ' · PRN' : ''}`} right={m.pharmacistReview?.status === 'REQUESTED' ? <Badge label="Review requested" tone="warning" /> : undefined} />
                  ))}
                </Card>
              ) : (
                <Card>
                  {d.careTeam.map((m) => (
                    <ListRow key={m.id} icon="person-outline" title={fullName(m.user)} subtitle={humanize(m.role)} />
                  ))}
                </Card>
              )}
            </View>
          </Section>
        </>
      )}
    </Screen>
  );
}
