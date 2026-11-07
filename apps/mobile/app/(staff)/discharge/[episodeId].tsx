import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DischargeContent } from '@recoveros/shared';
import { Badge, Banner, Button, Card, ChoiceChips, ErrorState, Header, ListRow, LoadingCards, Row, Screen, Section, Text, TextField, YesNo } from '@/components/ui';
import { DischargeEditor, emptyContent } from '@/components/DischargeEditor';
import { useTheme } from '@/theme/ThemeProvider';
import { hasPermission, useAuth } from '@/store/auth';
import { recoveryApi, recoveryKeys, useDischargePlan, useEpisode } from '@/features/recovery/api';
import { useTemplates } from '@/features/monitoring/api';
import { ApiError, errorMessage } from '@/services/api/client';
import { formatDate, fullName, humanize } from '@/utils/format';

/** Read-only rendering of discharge content for review/approval. */
function ContentReview({ content }: { content: DischargeContent }) {
  const { spacing } = useTheme();
  const sections: Array<[string, Array<{ title: string; details: string }>]> = [
    ['Clinical instructions', content.clinicalInstructions],
    ['Warning signs', content.warningSigns],
    ['Wound care', content.woundCare],
    ['Activity restrictions', content.activityRestrictions],
    ['Diet', content.dietaryInstructions],
    ['Rehabilitation', content.rehabilitationRequirements],
    ['Education', content.education],
  ];
  return (
    <View>
      {content.summary ? (
        <Card>
          <Text variant="body">{content.summary}</Text>
          <Text variant="caption" tone="secondary" style={{ marginTop: spacing.sm }}>
            Programme: {content.programmeDurationDays} days
          </Text>
        </Card>
      ) : null}
      {content.medications.length ? (
        <Section title="Medicines">
          <Card>
            {content.medications.map((m, i) => (
              <ListRow key={i} icon="medkit-outline" title={`${m.name}${m.strength ? ` ${m.strength}` : ''} — ${m.dose} (${humanize(m.route)})`} subtitle={`${m.frequencyText}${m.isPrn ? ' · PRN, no reminders' : ` · ${(m.schedule.timesOfDay ?? []).join(', ')}${m.schedule.durationDays ? ` for ${m.schedule.durationDays} days` : ''}`}`} />
            ))}
          </Card>
        </Section>
      ) : null}
      {sections.filter(([, items]) => items.length).map(([title, items]) => (
        <Section key={title} title={title}>
          <Card>
            {items.map((it, i) => (
              <View key={i} style={{ paddingVertical: spacing.sm }}>
                <Text variant="subheading">{it.title}</Text>
                <Text variant="bodySmall" tone="secondary">
                  {it.details}
                </Text>
              </View>
            ))}
          </Card>
        </Section>
      ))}
    </View>
  );
}

export default function DischargePlanScreen() {
  const { spacing } = useTheme();
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const can = (p: string) => hasPermission(user, p);
  const episode = useEpisode(episodeId);
  const plan = useDischargePlan(episodeId);
  const templates = useTemplates();
  const notFound = plan.error instanceof ApiError && plan.error.status === 404;

  const [draft, setDraft] = useState<DischargeContent>(emptyContent());
  const [amending, setAmending] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [comment, setComment] = useState('');
  const [understood, setUnderstood] = useState<boolean | undefined>();
  const [method, setMethod] = useState('TEACH_BACK');
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const current = plan.data?.currentVersion;
  const approved = plan.data?.approvedVersion;
  const planId = plan.data?.plan.id;
  useEffect(() => {
    if (current?.status === 'DRAFT') setDraft(current.content);
  }, [current?.id, current?.status, current?.content]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: recoveryKeys.discharge(episodeId) });
    void qc.invalidateQueries({ queryKey: recoveryKeys.episode(episodeId) });
    void qc.invalidateQueries({ queryKey: recoveryKeys.pendingApprovals });
  };
  const onError = (e: unknown) => setMessage({ tone: 'danger', text: e instanceof ApiError && e.details ? `${e.message}: ${(e.details as Array<{ path: string; message: string }>).map((d) => `${d.path} ${d.message}`).join('; ')}` : errorMessage(e) });

  const save = useMutation({
    mutationFn: async () => {
      if (!planId) return recoveryApi.createDischargePlan(episodeId, draft);
      return recoveryApi.updateDischargePlan(planId, draft);
    },
    onSuccess: () => {
      setMessage({ tone: 'success', text: 'Draft saved.' });
      refresh();
    },
    onError,
  });
  const submit = useMutation({
    mutationFn: async () => {
      await recoveryApi.updateDischargePlan(planId!, draft);
      return recoveryApi.submitDischargePlan(planId!);
    },
    onSuccess: () => {
      setMessage({ tone: 'success', text: 'Submitted for approval.' });
      refresh();
    },
    onError,
  });
  const decide = useMutation({
    mutationFn: (decision: 'APPROVED' | 'REJECTED') => recoveryApi.decideDischargePlan(planId!, { decision, comment: comment || undefined }),
    onSuccess: (r, decision) => {
      setMessage({ tone: 'success', text: decision === 'APPROVED' ? (r.activated ? 'Approved. The recovery programme is now active and the patient can see their plan.' : 'Approved.') : 'Returned to the author for revision.' });
      refresh();
    },
    onError,
  });
  const amend = useMutation({
    mutationFn: () => recoveryApi.amendDischargePlan(planId!, draft, amendReason),
    onSuccess: () => {
      setAmending(false);
      setMessage({ tone: 'success', text: 'Amendment saved as a new draft version. The approved version stays in force until the amendment is approved.' });
      refresh();
    },
    onError,
  });
  const understanding = useMutation({
    mutationFn: () => recoveryApi.recordUnderstanding(planId!, { method, understood: !!understood }),
    onSuccess: () => {
      setMessage({ tone: 'success', text: 'Patient understanding recorded.' });
      refresh();
    },
    onError,
  });

  const patient = episode.data?.episode && typeof episode.data.episode.patientId === 'object' ? episode.data.episode.patientId : undefined;
  const editable = (!planId && episode.data?.episode.status === 'DRAFT') || current?.status === 'DRAFT';

  return (
    <Screen keyboard onRefresh={() => void plan.refetch()} refreshing={plan.isRefetching}>
      <Header back title="Discharge plan" subtitle={fullName(patient)} />
      {message ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone={message.tone} title={message.tone === 'success' ? 'Done' : 'Action failed'} message={message.text} />
        </View>
      ) : null}
      {plan.isLoading || episode.isLoading ? (
        <LoadingCards count={3} />
      ) : plan.error && !notFound ? (
        <ErrorState message={errorMessage(plan.error)} onRetry={() => void plan.refetch()} />
      ) : (
        <>
          {plan.data ? (
            <Card style={{ marginBottom: spacing.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="overline" tone="secondary">
                  Status
                </Text>
                <Badge label={humanize(plan.data.plan.status)} tone={plan.data.plan.status === 'APPROVED' ? 'success' : plan.data.plan.status === 'SUBMITTED' ? 'warning' : 'neutral'} />
              </Row>
              {plan.data.versions?.map((v) => (
                <Text key={v.id} variant="caption" tone="secondary" style={{ marginTop: 4 }}>
                  v{v.versionNumber} · {humanize(v.status)}
                  {v.approvedAt ? ` · approved ${formatDate(v.approvedAt)}` : ''}
                </Text>
              ))}
            </Card>
          ) : null}

          {/* Draft editing (authors) */}
          {editable && can('discharge.create') ? (
            <>
              <DischargeEditor value={draft} onChange={setDraft} templates={templates.data ?? []} />
              <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
                <Button title="Save draft" variant="outline" loading={save.isPending} onPress={() => save.mutate()} />
                {planId ? <Button title="Submit for approval" icon="send" loading={submit.isPending} onPress={() => submit.mutate()} /> : null}
              </View>
            </>
          ) : null}

          {/* Approval (authorised clinicians only) */}
          {current?.status === 'SUBMITTED' ? (
            <>
              <Banner tone="warning" title="Awaiting clinical approval" message="Review every instruction and medicine. Approval activates the patient's recovery programme." />
              <View style={{ marginTop: spacing.lg }}>
                <ContentReview content={current.content} />
              </View>
              {can('discharge.approve') ? (
                <Card style={{ marginTop: spacing.xl }}>
                  <TextField label="Comment (optional)" value={comment} onChangeText={setComment} multiline />
                  <Button title="Approve & activate programme" icon="shield-checkmark-outline" loading={decide.isPending && decide.variables === 'APPROVED'} onPress={() => decide.mutate('APPROVED')} />
                  <Button title="Return for revision" variant="ghost" style={{ marginTop: spacing.sm }} loading={decide.isPending && decide.variables === 'REJECTED'} onPress={() => decide.mutate('REJECTED')} />
                </Card>
              ) : (
                <Text variant="bodySmall" tone="secondary" style={{ marginTop: spacing.lg }}>
                  Only an authorised clinician can approve this plan.
                </Text>
              )}
            </>
          ) : null}

          {/* Approved plan */}
          {approved && current?.status !== 'SUBMITTED' && !editable ? (
            <>
              <Banner tone="success" title={`Approved version ${approved.versionNumber}`} message="Approved content cannot be edited. Changes require an amendment that is re-approved." />
              <View style={{ marginTop: spacing.lg }}>
                <ContentReview content={approved.content} />
              </View>
              {can('discharge.review') ? (
                <Section title="Patient understanding">
                  <Card>
                    {(approved.patientUnderstanding ?? []).map((u, i) => (
                      <Text key={i} variant="bodySmall" tone="secondary">
                        {formatDate(u.recordedAt)} · {humanize(u.method)} · {u.understood ? 'Understood' : 'Needs follow-up'}
                      </Text>
                    ))}
                    <View style={{ marginTop: spacing.md }}>
                      <ChoiceChips label="Method" value={method} onChange={setMethod} options={[{ value: 'TEACH_BACK', label: 'Teach-back' }, { value: 'VERBAL_CONFIRMATION', label: 'Verbal' }, { value: 'INTERPRETER_ASSISTED', label: 'Interpreter' }, { value: 'CAREGIVER_CONFIRMED', label: 'Caregiver' }]} />
                      <View style={{ height: spacing.md }} />
                      <YesNo label="Understood" value={understood} onChange={setUnderstood} yes="Understood" no="Needs follow-up" />
                      <Button title="Record" style={{ marginTop: spacing.md }} disabled={understood === undefined} loading={understanding.isPending} onPress={() => understanding.mutate()} />
                    </View>
                  </Card>
                </Section>
              ) : null}
              {can('discharge.create') ? (
                amending ? (
                  <Section title="Amend plan">
                    <DischargeEditor value={draft} onChange={setDraft} templates={templates.data ?? []} />
                    <TextField label="Reason for amendment" value={amendReason} onChangeText={setAmendReason} multiline />
                    <Button title="Save amendment draft" disabled={amendReason.trim().length < 3} loading={amend.isPending} onPress={() => amend.mutate()} />
                  </Section>
                ) : (
                  <Button
                    title="Amend plan"
                    icon="create-outline"
                    variant="outline"
                    style={{ marginTop: spacing.xl }}
                    onPress={() => {
                      setDraft(approved.content);
                      setAmending(true);
                    }}
                  />
                )
              ) : null}
            </>
          ) : null}

          {!plan.data && !editable ? (
            <Text variant="bodySmall" tone="secondary">
              No discharge plan has been drafted for this episode.
            </Text>
          ) : null}
          <Button title="Back to episode" variant="ghost" style={{ marginTop: spacing.lg }} onPress={() => router.replace(`/(staff)/episodes/${episodeId}`)} />
        </>
      )}
    </Screen>
  );
}
