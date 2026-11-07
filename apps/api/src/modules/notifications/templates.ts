/**
 * Notification templates. External-channel text (SMS, push preview, email subject) is
 * deliberately generic: NO diagnosis, medication names, symptoms or other clinical
 * detail. Details are shown only inside the authenticated app.
 *
 * Templates marked `sensitiveCode` carry a one-time code (OTP / reset token) — not
 * clinical data, but must never be logged in production.
 */
export interface TemplateOutput {
  title: string;
  body: string;
  sensitiveCode?: boolean;
}

type Vars = Record<string, string | number | undefined>;

export const TEMPLATES = {
  VERIFICATION_CODE: (v: Vars): TemplateOutput => ({
    title: 'RecoverOS verification code',
    body: `Your RecoverOS verification code is ${v.code}. It expires in 10 minutes. Never share this code.`,
    sensitiveCode: true,
  }),
  PASSWORD_RESET: (v: Vars): TemplateOutput => ({
    title: 'Reset your RecoverOS password',
    body: `Use this code to reset your RecoverOS password: ${v.token}. It expires in 30 minutes. If you did not request this, ignore this message.`,
    sensitiveCode: true,
  }),
  INVITATION: (v: Vars): TemplateOutput => ({
    title: `You're invited to RecoverOS`,
    body: `${v.hospitalName ?? 'Your hospital'} has invited you to RecoverOS. Your activation code: ${v.token}. Open the RecoverOS app and choose "Activate account".`,
    sensitiveCode: true,
  }),
  TASK_REMINDER: (): TemplateOutput => ({
    title: 'RecoverOS reminder',
    body: 'You have a recovery activity due. Open RecoverOS to view it.',
  }),
  MEDICATION_REMINDER: (): TemplateOutput => ({
    title: 'RecoverOS reminder',
    body: 'It is time for a scheduled activity in your recovery plan. Open RecoverOS for details.',
  }),
  CHECKIN_DUE: (): TemplateOutput => ({
    title: 'Daily check-in',
    body: 'Your recovery check-in is ready. It takes about two minutes.',
  }),
  APPOINTMENT_REMINDER: (v: Vars): TemplateOutput => ({
    title: 'Upcoming appointment',
    body: `You have an appointment ${v.when ?? 'soon'}. Open RecoverOS for details.`,
  }),
  APPOINTMENT_CHANGED: (): TemplateOutput => ({
    title: 'Appointment update',
    body: 'One of your appointments has been updated. Open RecoverOS for details.',
  }),
  ALERT_ASSIGNED: (v: Vars): TemplateOutput => ({
    title: `${v.priority ?? ''} recovery alert`.trim(),
    body: 'A recovery alert needs your attention. Open RecoverOS to review.',
  }),
  ALERT_ESCALATED: (v: Vars): TemplateOutput => ({
    title: `Escalated ${String(v.priority ?? '').toLowerCase()} alert`.trim(),
    body: 'An unacknowledged recovery alert has been escalated to you. Open RecoverOS to review.',
  }),
  NEW_MESSAGE: (): TemplateOutput => ({
    title: 'New message',
    body: 'You have a new message in RecoverOS.',
  }),
  CAREGIVER_INVITATION: (v: Vars): TemplateOutput => ({
    title: 'Caregiver invitation',
    body: `${v.patientFirstName ?? 'A patient'} has invited you to support their recovery on RecoverOS. Activation code: ${v.token}.`,
    sensitiveCode: true,
  }),
  PROGRAMME_STATUS: (): TemplateOutput => ({
    title: 'Recovery programme update',
    body: 'There is an update to your recovery programme. Open RecoverOS for details.',
  }),
} as const;

export type TemplateName = keyof typeof TEMPLATES;
