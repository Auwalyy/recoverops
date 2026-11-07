import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { APPOINTMENT_TYPES } from '@recoveros/shared';
import { Banner, Button, Card, ChoiceChips, Header, ListRow, Screen, Section, Text, TextField } from '@/components/ui';
import { careApi, useStaff } from '@/features/care/api';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessage } from '@/services/api/client';
import { fullName, humanize } from '@/utils/format';

/** Book a follow-up / investigation appointment for an episode. */
export default function NewAppointment() {
  const { spacing } = useTheme();
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const clinicians = useStaff({ role: 'DOCTOR' });
  const [type, setType] = useState<string>('FOLLOW_UP');
  const [mode, setMode] = useState<string>('IN_PERSON');
  const [date, setDate] = useState(new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [instructions, setInstructions] = useState('');
  const [clinicianId, setClinicianId] = useState<string | undefined>();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

  const create = useMutation({
    mutationFn: () =>
      careApi.createAppointment({
        episodeId,
        clinicianId,
        type,
        mode,
        // Hospital local time (Africa/Lagos, UTC+1, no DST).
        scheduledAt: `${date}T${time}:00+01:00`,
        location: location || undefined,
        instructions: instructions || undefined,
      }),
    onSuccess: () => router.back(),
  });

  return (
    <Screen keyboard>
      <Header back title="Book appointment" />
      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        Type
      </Text>
      <ChoiceChips label="Appointment type" value={type} onChange={setType} options={APPOINTMENT_TYPES.map((t) => ({ value: t, label: humanize(t) }))} />
      <View style={{ height: spacing.lg }} />
      <Text variant="label" style={{ marginBottom: spacing.sm }}>
        Mode
      </Text>
      <ChoiceChips label="Mode" value={mode} onChange={setMode} options={[{ value: 'IN_PERSON', label: 'In person' }, { value: 'PHONE', label: 'Phone' }, { value: 'VIDEO', label: 'Video' }]} />
      <View style={{ height: spacing.lg }} />
      <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <TextField label="Time (24h, hospital time)" value={time} onChangeText={setTime} placeholder="10:00" />
      <TextField label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Surgical Outpatients, Room 4" />
      <TextField label="Instructions for the patient" value={instructions} onChangeText={setInstructions} multiline />
      <Section title="Clinician (optional)" style={{ marginTop: 0 }}>
        <Card>
          {(clinicians.data ?? []).map((c) => (
            <ListRow key={c.userId} icon={clinicianId === c.userId ? 'radio-button-on' : 'radio-button-off'} title={fullName(c)} subtitle={c.title} onPress={() => setClinicianId(c.userId)} />
          ))}
        </Card>
      </Section>
      {create.error ? (
        <View style={{ marginTop: spacing.lg }}>
          <Banner tone="danger" title="Could not book" message={errorMessage(create.error)} />
        </View>
      ) : null}
      <Button title="Book appointment" style={{ marginTop: spacing.xl }} disabled={!validDate} loading={create.isPending} onPress={() => create.mutate()} />
    </Screen>
  );
}
