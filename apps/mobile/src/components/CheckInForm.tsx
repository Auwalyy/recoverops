import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, ChoiceChips, ProgressBar, ScaleSelector, Text, TextField, YesNo } from '@/components/ui';
import { SafetyMessages } from '@/components/patient';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { usePreferences } from '@/store/preferences';
import { newIdempotencyKey, submitOrQueue } from '@/offline/sync';
import { ApiError, errorMessage } from '@/services/api/client';
import type { CheckInTemplate, SafetyMessage } from '@/types/models';
import { useT } from '@/i18n';

export type Answers = Record<string, string | number | boolean | string[]>;

/** Client-side required/range validation mirroring the server's template validation. */
export function validateCheckIn(template: Pick<CheckInTemplate, 'questions'>, answers: Answers): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const q of template.questions) {
    const v = answers[q.key];
    const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) errs[q.key] = 'Please answer this question';
      continue;
    }
    if ((q.type === 'SCALE' || q.type === 'NUMBER') && typeof v === 'number') {
      if ((q.min != null && v < q.min) || (q.max != null && v > q.max)) errs[q.key] = `Enter a value between ${q.min} and ${q.max}`;
    }
  }
  return errs;
}

/**
 * Dynamic check-in form rendered from a hospital-approved template. Patient answers are
 * submitted (or queued offline with an idempotency key). Safety messages from approved
 * rules are shown immediately.
 */
export function CheckInForm({ template, episodeId, taskId, onDone }: { template: CheckInTemplate; episodeId: string; taskId?: string; onDone: () => void }) {
  const { spacing } = useTheme();
  const t = useT();
  const qc = useQueryClient();
  const lang = usePreferences((s) => s.language);
  const userId = useAuth((s) => s.user?.id ?? '');
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ queued: boolean; safety: SafetyMessage[] } | null>(null);
  // Stable key for this form instance: retries never create a second check-in.
  const idempotencyKey = useMemo(() => newIdempotencyKey('checkin'), []);

  const answered = template.questions.filter((q) => answers[q.key] !== undefined && answers[q.key] !== '').length;
  const set = (k: string, v: Answers[string]) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const submit = async () => {
    const errs = validateCheckIn(template, answers);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await submitOrQueue<{ safetyMessages: SafetyMessage[] }>(userId, 'CHECK_IN', '/check-ins', {
        episodeId,
        templateId: template.id,
        taskId,
        answers,
        idempotencyKey,
        clientSubmittedAt: new Date().toISOString(),
      });
      setResult({ queued: r.queued, safety: r.queued ? [] : r.data.safetyMessages });
      void qc.invalidateQueries({ queryKey: ['tasks-today'] });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR') setErrors(e.fieldErrors());
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <View style={{ gap: spacing.lg }}>
        <Banner tone="success" title={result.queued ? 'Check-in saved' : 'Check-in sent'} message={result.queued ? t('common.offlineQueued') : 'Thank you. Your care team can now see how you are doing.'} />
        <SafetyMessages messages={result.safety} />
        <Button title={t('common.done')} onPress={onDone} />
      </View>
    );
  }

  return (
    <View>
      <View style={{ marginBottom: spacing.xl }}>
        <ProgressBar value={template.questions.length ? answered / template.questions.length : 0} />
        <Text variant="caption" tone="secondary" style={{ marginTop: 6 }}>
          {answered} of {template.questions.length} answered
        </Text>
      </View>
      {template.questions.map((q, i) => {
        const label = q.translations?.[lang]?.label ?? q.label;
        const help = q.translations?.[lang]?.helpText ?? q.helpText;
        const value = answers[q.key];
        return (
          <Card key={q.key} style={{ marginBottom: spacing.md }}>
            <Text variant="overline" tone="secondary">
              Question {i + 1}
              {q.required ? '' : ' · optional'}
            </Text>
            <Text variant="subheading" style={{ marginTop: 4, marginBottom: spacing.md }}>
              {label}
            </Text>
            {help ? (
              <Text variant="bodySmall" tone="secondary" style={{ marginTop: -spacing.sm, marginBottom: spacing.md }}>
                {help}
              </Text>
            ) : null}
            {q.type === 'SCALE' ? (
              <ScaleSelector label={label} min={q.min ?? 0} max={q.max ?? 10} value={value as number | undefined} onChange={(v) => set(q.key, v)} lowLabel="None" highLabel="Worst" />
            ) : q.type === 'BOOLEAN' ? (
              <YesNo label={label} value={value as boolean | undefined} onChange={(v) => set(q.key, v)} />
            ) : q.type === 'SINGLE_CHOICE' ? (
              <ChoiceChips label={label} options={(q.options ?? []).map((o) => ({ value: o.value, label: o.label }))} value={value as string | undefined} onChange={(v) => set(q.key, v)} />
            ) : q.type === 'MULTI_CHOICE' ? (
              <View style={{ gap: spacing.sm }}>
                {(q.options ?? []).map((o) => {
                  const arr = (value as string[] | undefined) ?? [];
                  const on = arr.includes(o.value);
                  return <Button key={o.value} title={o.label} icon={on ? 'checkbox' : 'square-outline'} variant={on ? 'secondary' : 'outline'} size="md" onPress={() => set(q.key, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} />;
                })}
              </View>
            ) : q.type === 'NUMBER' ? (
              <TextField label={label} keyboardType="decimal-pad" value={value === undefined ? '' : String(value)} onChangeText={(t2) => set(q.key, t2 === '' ? '' : Number(t2))} />
            ) : (
              <TextField label={label} multiline value={(value as string | undefined) ?? ''} onChangeText={(t2) => set(q.key, t2)} placeholder="Type here" />
            )}
            {errors[q.key] ? (
              <Text variant="caption" tone="danger" accessibilityRole="alert" style={{ marginTop: spacing.sm }}>
                {errors[q.key]}
              </Text>
            ) : null}
          </Card>
        );
      })}
      {submitError ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="danger" title="Could not send check-in" message={submitError} />
        </View>
      ) : null}
      <Button title={t('common.submit')} onPress={() => void submit()} loading={busy} />
    </View>
  );
}
