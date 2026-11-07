import { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Banner, Button, Card, ChoiceChips, FormField, Header, Screen, Text } from '@/components/ui';
import { EmergencyCard, SafetyMessages } from '@/components/patient';
import { useTheme } from '@/theme/ThemeProvider';
import { useMyActiveEpisode } from '@/features/recovery/api';
import { useAuth } from '@/store/auth';
import { isOnline, newIdempotencyKey, submitOrQueue } from '@/offline/sync';
import { api, errorMessage } from '@/services/api/client';
import type { SafetyMessage } from '@/types/models';
import { useT } from '@/i18n';

export const symptomFormSchema = z.object({
  description: z.string().trim().min(3, 'Describe what you are feeling'),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE'], { message: 'Choose how bad it is' }),
  trend: z.enum(['NEW', 'WORSENING', 'UNCHANGED', 'IMPROVING'], { message: 'Choose how it is changing' }),
  durationText: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});
type SymptomForm = z.infer<typeof symptomFormSchema>;

/**
 * Patient symptom report. The app never interprets or diagnoses — reports go to the
 * care team and are checked against the hospital's approved escalation rules.
 */
export default function ReportSymptom() {
  const { colors, spacing, radius } = useTheme();
  const t = useT();
  const userId = useAuth((s) => s.user?.id ?? '');
  const { episode } = useMyActiveEpisode();
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ queued: boolean; safety: SafetyMessage[] } | null>(null);
  const idempotencyKey = useMemo(() => newIdempotencyKey('symptom'), []);
  const { control, handleSubmit, formState } = useForm<SymptomForm>({ resolver: zodResolver(symptomFormSchema), defaultValues: { description: '', durationText: '', notes: '' } });

  const pickPhoto = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Permission is needed to attach a photo. You can still send your report without one.');
    const res = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ['images'] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] });
    if (!res.canceled && res.assets[0]) setPhoto(res.assets[0]);
  };

  const onSubmit = handleSubmit(async (v) => {
    if (!episode) return;
    setError(null);
    try {
      let attachmentIds: string[] | undefined;
      if (photo) {
        // Photos are only sent online (never stored in the offline queue).
        if (!(await isOnline())) throw new Error('Photos can only be sent with an internet connection. Remove the photo to save your report offline.');
        const form = new FormData();
        form.append('file', { uri: photo.uri, name: 'symptom.jpg', type: photo.mimeType ?? 'image/jpeg' } as unknown as Blob);
        form.append('type', 'ATTACHMENT');
        form.append('title', 'Symptom photo');
        form.append('episodeId', episode.id);
        const up = await api<{ document: { id: string } }>('/documents', { method: 'POST', formData: form, timeoutMs: 60_000 });
        attachmentIds = [up.document.id];
      }
      const r = await submitOrQueue<{ safetyMessages: SafetyMessage[] }>(userId, 'SYMPTOM', '/symptoms', { ...v, episodeId: episode.id, attachmentIds, idempotencyKey });
      setResult({ queued: r.queued, safety: r.queued ? [] : r.data.safetyMessages });
    } catch (e) {
      setError(e instanceof Error && !(e as { code?: string }).code ? e.message : errorMessage(e));
    }
  });

  if (result) {
    return (
      <Screen>
        <Header title="Report sent" />
        <View style={{ gap: spacing.lg }}>
          <Banner tone="success" title={result.queued ? 'Saved' : 'Your care team has your report'} message={result.queued ? t('common.offlineQueued') : 'A member of your care team will review it.'} />
          <SafetyMessages messages={result.safety} />
          <EmergencyCard />
          <Button title={t('common.done')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Header back title="Report a symptom" subtitle="Tell your care team what you are experiencing." />
      <View style={{ marginBottom: spacing.lg }}>
        <EmergencyCard compact />
      </View>
      <FormField control={control} name="description" label="What are you feeling?" multiline placeholder="e.g. My wound is more painful today and there is some fluid" />
      <Controller
        control={control}
        name="severity"
        render={({ field, fieldState }) => (
          <View style={{ marginBottom: spacing.lg }}>
            <Text variant="label" style={{ marginBottom: spacing.sm }}>
              How bad is it?
            </Text>
            <ChoiceChips label="Severity" value={field.value} onChange={field.onChange} options={[{ value: 'MILD', label: 'Mild' }, { value: 'MODERATE', label: 'Moderate' }, { value: 'SEVERE', label: 'Severe' }]} />
            {fieldState.error ? <Text variant="caption" tone="danger" style={{ marginTop: 4 }}>{fieldState.error.message}</Text> : null}
          </View>
        )}
      />
      <Controller
        control={control}
        name="trend"
        render={({ field, fieldState }) => (
          <View style={{ marginBottom: spacing.lg }}>
            <Text variant="label" style={{ marginBottom: spacing.sm }}>
              Is it changing?
            </Text>
            <ChoiceChips label="Change over time" value={field.value} onChange={field.onChange} options={[{ value: 'NEW', label: 'New' }, { value: 'WORSENING', label: 'Getting worse' }, { value: 'UNCHANGED', label: 'Same' }, { value: 'IMPROVING', label: 'Getting better' }]} />
            {fieldState.error ? <Text variant="caption" tone="danger" style={{ marginTop: 4 }}>{fieldState.error.message}</Text> : null}
          </View>
        )}
      />
      <FormField control={control} name="durationText" label="How long has this been happening? (optional)" placeholder="e.g. Since yesterday evening" />
      <FormField control={control} name="notes" label="Anything else? (optional)" multiline />

      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        Photo (optional)
      </Text>
      {photo ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: radius.md }} accessibilityLabel="Attached photo" />
          <Button title="Remove photo" icon="trash-outline" variant="ghost" size="sm" onPress={() => setPhoto(null)} style={{ marginTop: spacing.sm }} />
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          {(['camera', 'images'] as const).map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'camera' ? 'Take a photo' : 'Choose a photo'} onPress={() => void pickPhoto(k === 'camera')} style={{ flex: 1, height: 88, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
              <Ionicons name={k === 'camera' ? 'camera-outline' : 'image-outline'} size={24} color={colors.primary} />
              <Text variant="caption" tone="secondary" style={{ marginTop: 4 }}>
                {k === 'camera' ? 'Take photo' : 'Choose photo'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {error ? (
        <View style={{ marginBottom: spacing.md }}>
          <Banner tone="danger" title="Could not send" message={error} />
        </View>
      ) : null}
      <Button title="Send to my care team" icon="send" onPress={() => void onSubmit()} loading={formState.isSubmitting} disabled={!episode} />
    </Screen>
  );
}
