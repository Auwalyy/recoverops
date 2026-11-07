import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, ChoiceChips, Text, TextField } from '@/components/ui';
import { SafetyMessages } from '@/components/patient';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/store/auth';
import { newIdempotencyKey, submitOrQueue } from '@/offline/sync';
import { errorMessage } from '@/services/api/client';
import type { SafetyMessage, Task } from '@/types/models';
import { useT } from '@/i18n';

type Status = 'REPORTED_TAKEN' | 'REPORTED_DELAYED' | 'REPORTED_MISSED' | 'UNABLE_TO_OBTAIN';

/**
 * Patient-reported dose status. Wording deliberately says "I took / I missed" — the
 * system records it as a report, never as verified administration. No dosing advice.
 */
export function MedicationReportSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const t = useT();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id ?? '');
  const [status, setStatus] = useState<Status | undefined>();
  const [access, setAccess] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [sideEffects, setSideEffects] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ queued: boolean; safety: SafetyMessage[] } | null>(null);

  const reset = () => {
    setStatus(undefined);
    setAccess(undefined);
    setNotes('');
    setSideEffects('');
    setResult(null);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!task || !status) return;
    setBusy(true);
    setError(null);
    try {
      const r = await submitOrQueue<{ safetyMessages: SafetyMessage[] }>(userId, 'MEDICATION_EVENT', '/medication-events', {
        medicationOrderId: task.medicationOrderId,
        taskId: task.id,
        scheduledFor: task.dueAt,
        status,
        reason: notes || undefined,
        sideEffects: sideEffects || undefined,
        accessProblem: status === 'UNABLE_TO_OBTAIN' ? (access ?? 'OTHER') : undefined,
        requestPharmacistReview: !!sideEffects || status === 'UNABLE_TO_OBTAIN',
        idempotencyKey: newIdempotencyKey('med'),
      });
      setResult({ queued: r.queued, safety: r.queued ? [] : r.data.safetyMessages });
      void qc.invalidateQueries({ queryKey: ['tasks-today'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!task} transparent animationType="slide" onRequestClose={reset}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={reset} accessibilityLabel="Close" />
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '88%' }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.lg }} />
          <Text variant="title">{task?.title}</Text>
          <Text variant="bodySmall" tone="secondary" style={{ marginTop: 4, marginBottom: spacing.lg }}>
            {task?.instructions}
          </Text>
          {result ? (
            <View style={{ gap: spacing.md }}>
              <Banner tone="success" title={result.queued ? 'Saved' : 'Thank you'} message={result.queued ? t('common.offlineQueued') : 'Your report has been shared with your care team.'} />
              <SafetyMessages messages={result.safety} />
              <Button title={t('common.done')} onPress={reset} />
            </View>
          ) : (
            <>
              <Text variant="label" style={{ marginBottom: spacing.sm }}>
                What happened with this dose?
              </Text>
              <ChoiceChips<Status>
                label="Dose status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'REPORTED_TAKEN', label: 'I took it' },
                  { value: 'REPORTED_DELAYED', label: 'I took it late' },
                  { value: 'REPORTED_MISSED', label: 'I missed it' },
                  { value: 'UNABLE_TO_OBTAIN', label: "I couldn't get it" },
                ]}
              />
              {status === 'UNABLE_TO_OBTAIN' ? (
                <View style={{ marginTop: spacing.lg }}>
                  <Text variant="label" style={{ marginBottom: spacing.sm }}>
                    Why?
                  </Text>
                  <ChoiceChips
                    label="Reason"
                    value={access}
                    onChange={setAccess}
                    options={[
                      { value: 'COST', label: 'Cost' },
                      { value: 'OUT_OF_STOCK', label: 'Out of stock' },
                      { value: 'PHARMACY_ACCESS', label: "Can't reach pharmacy" },
                      { value: 'LOST', label: 'Lost' },
                      { value: 'OTHER', label: 'Other' },
                    ]}
                  />
                </View>
              ) : null}
              <View style={{ marginTop: spacing.lg }}>
                <TextField label="Any side effects? (optional)" value={sideEffects} onChangeText={setSideEffects} placeholder="Describe anything unusual you noticed" multiline />
                <TextField label="Note for your care team (optional)" value={notes} onChangeText={setNotes} multiline />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
                  Do not take an extra dose to make up for a missed one unless your care team has told you to. If unsure, message your care team.
                </Text>
              </View>
              {error ? <Banner tone="danger" title="Could not save" message={error} /> : null}
              <Button title={t('common.submit')} onPress={() => void submit()} loading={busy} disabled={!status} style={{ marginTop: spacing.md }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
