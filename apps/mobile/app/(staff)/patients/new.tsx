import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Banner, Button, Card, ChoiceChips, FormField, Header, ListRow, Screen, Section, Text, YesNo } from '@/components/ui';
import { careApi, careKeys, useStaff } from '@/features/care/api';
import { recoveryApi } from '@/features/recovery/api';
import { useTheme } from '@/theme/ThemeProvider';
import { ApiError, errorMessage } from '@/services/api/client';
import { fullName } from '@/utils/format';

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const onboardingSchema = z.object({
  hospitalPatientRef: z.string().trim().min(1, 'Hospital number is required'),
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  dateOfBirth: iso,
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Use international format, e.g. +2348012345678').or(z.literal('')),
  preferredLanguage: z.enum(['en', 'ha', 'pcm']),
  invitePatient: z.boolean(),
});
const episodeSchema = z.object({
  departmentId: z.string().min(1, 'Choose a department'),
  responsibleDoctorId: z.string().min(1, 'Choose the responsible doctor'),
  admissionDate: iso,
  procedureReference: z.string().trim().max(200).optional(),
  programmeName: z.string().trim().max(120).optional(),
});

/**
 * New discharge onboarding: register the patient (or reuse an existing record), then
 * open a recovery episode. The discharge plan is drafted next.
 */
export default function NewOnboarding() {
  const { spacing } = useTheme();
  const params = useLocalSearchParams<{ patientId?: string }>();
  const [patientId, setPatientId] = useState<string | undefined>(params.patientId);
  const [inviteCode, setInviteCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const departments = useQuery({ queryKey: careKeys.departments, queryFn: careApi.departments });
  const doctors = useStaff({ role: 'DOCTOR' });

  const patientForm = useForm<z.infer<typeof onboardingSchema>>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { hospitalPatientRef: '', firstName: '', lastName: '', dateOfBirth: '', sex: 'FEMALE', phone: '', preferredLanguage: 'en', invitePatient: true },
  });
  const epForm = useForm<z.infer<typeof episodeSchema>>({ resolver: zodResolver(episodeSchema), defaultValues: { departmentId: '', responsibleDoctorId: '', admissionDate: new Date().toISOString().slice(0, 10) } });

  const createPatient = useMutation({
    mutationFn: (v: z.infer<typeof onboardingSchema>) => recoveryApi.createPatient({ ...v, phone: v.phone || undefined, timezone: 'Africa/Lagos', contactPreferences: { channels: ['PUSH', 'SMS'] } } as never),
    onSuccess: (r) => {
      setPatientId(r.patient.id);
      setInviteCode(r.invitation?.devToken);
    },
    onError: (e) => {
      if (e instanceof ApiError) for (const [k, m] of Object.entries(e.fieldErrors())) patientForm.setError(k as never, { message: m });
      setError(errorMessage(e));
    },
  });
  const createEpisode = useMutation({
    mutationFn: (v: z.infer<typeof episodeSchema>) => recoveryApi.createEpisode({ ...v, patientId: patientId! }),
    onSuccess: (r) => router.replace(`/(staff)/discharge/${r.episode.id}`),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Screen keyboard>
      <Header back title="New discharge onboarding" subtitle={patientId ? 'Step 2 of 2 · Recovery episode' : 'Step 1 of 2 · Patient details'} />
      {error ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Banner tone="danger" title="Could not save" message={error} />
        </View>
      ) : null}
      {!patientId ? (
        <>
          <FormField control={patientForm.control} name="hospitalPatientRef" label="Hospital number (MRN)" autoCapitalize="characters" />
          <FormField control={patientForm.control} name="firstName" label="First name" />
          <FormField control={patientForm.control} name="lastName" label="Last name" />
          <FormField control={patientForm.control} name="dateOfBirth" label="Date of birth" placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <Controller control={patientForm.control} name="sex" render={({ field }) => (
            <View style={{ marginBottom: spacing.lg }}>
              <Text variant="label" style={{ marginBottom: spacing.sm }}>Sex</Text>
              <ChoiceChips label="Sex" value={field.value} onChange={field.onChange} options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }, { value: 'OTHER', label: 'Other' }, { value: 'UNDISCLOSED', label: 'Prefer not to say' }]} />
            </View>
          )} />
          <FormField control={patientForm.control} name="phone" label="Mobile phone" keyboardType="phone-pad" placeholder="+234…" hint="Used for reminders and app activation." />
          <Controller control={patientForm.control} name="preferredLanguage" render={({ field }) => (
            <View style={{ marginBottom: spacing.lg }}>
              <Text variant="label" style={{ marginBottom: spacing.sm }}>Preferred language</Text>
              <ChoiceChips label="Language" value={field.value} onChange={field.onChange} options={[{ value: 'en', label: 'English' }, { value: 'ha', label: 'Hausa' }, { value: 'pcm', label: 'Pidgin' }]} />
            </View>
          )} />
          <Controller control={patientForm.control} name="invitePatient" render={({ field }) => (
            <View style={{ marginBottom: spacing.xl }}>
              <Text variant="label" style={{ marginBottom: spacing.sm }}>Send app activation code by SMS?</Text>
              <YesNo label="Invite patient" value={field.value} onChange={field.onChange} />
            </View>
          )} />
          <Button title="Register patient" loading={createPatient.isPending} onPress={() => void patientForm.handleSubmit((v) => createPatient.mutate(v))()} />
        </>
      ) : (
        <>
          {inviteCode ? (
            <View style={{ marginBottom: spacing.lg }}>
              <Banner tone="info" title="Development activation code" message={inviteCode} />
            </View>
          ) : null}
          <Controller control={epForm.control} name="departmentId" render={({ field, fieldState }) => (
            <Section title="Department" style={{ marginTop: 0 }}>
              <ChoiceChips label="Department" value={field.value} onChange={field.onChange} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
              {fieldState.error ? <Text variant="caption" tone="danger">{fieldState.error.message}</Text> : null}
            </Section>
          )} />
          <Controller control={epForm.control} name="responsibleDoctorId" render={({ field, fieldState }) => (
            <Section title="Responsible doctor">
              <Card>
                {(doctors.data ?? []).map((d) => (
                  <ListRow key={d.userId} icon={field.value === d.userId ? 'radio-button-on' : 'radio-button-off'} title={fullName(d)} subtitle={d.title} onPress={() => field.onChange(d.userId)} />
                ))}
              </Card>
              {fieldState.error ? <Text variant="caption" tone="danger">{fieldState.error.message}</Text> : null}
            </Section>
          )} />
          <View style={{ height: spacing.lg }} />
          <FormField control={epForm.control} name="admissionDate" label="Admission date" placeholder="YYYY-MM-DD" />
          <FormField control={epForm.control} name="procedureReference" label="Procedure (reference)" placeholder="e.g. Laparoscopic appendicectomy" />
          <FormField control={epForm.control} name="programmeName" label="Programme name (optional)" placeholder="e.g. Post-surgical recovery (14 days)" />
          <Button title="Create episode & draft discharge plan" loading={createEpisode.isPending} onPress={() => void epForm.handleSubmit((v) => createEpisode.mutate(v))()} />
        </>
      )}
    </Screen>
  );
}
