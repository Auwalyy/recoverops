import { loginFormSchema } from '../app/(auth)/login';
import { symptomFormSchema } from '../app/(patient)/symptom';
import { onboardingSchema } from '../app/(staff)/patients/new';
import { validateCheckIn } from '@/components/CheckInForm';
import { submitCheckInSchema, password } from '@recoveros/shared';

describe('form validation', () => {
  it('login requires identifier and password', () => {
    expect(loginFormSchema.safeParse({ identifier: '', password: '' }).success).toBe(false);
    expect(loginFormSchema.safeParse({ identifier: '+2348012345678', password: 'x' }).success).toBe(true);
  });

  it('password policy is shared with the backend', () => {
    expect(password.safeParse('short1').success).toBe(false);
    expect(password.safeParse('nonumberslong').success).toBe(false);
    expect(password.safeParse('LongEnough2026').success).toBe(true);
  });

  it('symptom report requires description, severity and trend', () => {
    const r = symptomFormSchema.safeParse({ description: 'x' });
    expect(r.success).toBe(false);
    expect(symptomFormSchema.safeParse({ description: 'Wound is painful', severity: 'MODERATE', trend: 'WORSENING' }).success).toBe(true);
  });

  it('onboarding validates dates and Nigerian phone numbers', () => {
    const base = { hospitalPatientRef: 'MRN1', firstName: 'A', lastName: 'B', dateOfBirth: '1980-01-01', sex: 'MALE', phone: '+2348012345678', preferredLanguage: 'ha', invitePatient: true };
    expect(onboardingSchema.safeParse(base).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...base, dateOfBirth: '01/01/1980' }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, phone: '0801' }).success).toBe(false);
  });

  it('check-in answers are validated against the approved template', () => {
    const template = {
      questions: [
        { key: 'pain_score', type: 'SCALE' as const, label: 'Pain', required: true, min: 0, max: 10 },
        { key: 'notes', type: 'TEXT' as const, label: 'Notes', required: false },
      ],
    };
    expect(validateCheckIn(template, {})).toHaveProperty('pain_score');
    expect(validateCheckIn(template, { pain_score: 11 })).toHaveProperty('pain_score');
    expect(validateCheckIn(template, { pain_score: 4 })).toEqual({});
  });

  it('queued check-ins always carry an idempotency key (shared contract)', () => {
    const ok = submitCheckInSchema.safeParse({ episodeId: '64b7f0f0f0f0f0f0f0f0f0f0', templateId: '64b7f0f0f0f0f0f0f0f0f0f1', answers: {}, idempotencyKey: 'checkin-xyz' });
    expect(ok.success).toBe(true);
    expect(submitCheckInSchema.safeParse({ episodeId: '64b7f0f0f0f0f0f0f0f0f0f0', templateId: '64b7f0f0f0f0f0f0f0f0f0f1', answers: {} }).success).toBe(false);
  });
});
