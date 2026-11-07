import { z, type ZodType } from 'zod';
import * as S from '@recoveros/shared';
import { env } from '../config/env';

/**
 * OpenAPI 3.1 document generated from the SAME Zod schemas the API validates with, so
 * the documentation cannot drift from the implementation's request contracts.
 */
interface Endpoint {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  tag: string;
  summary: string;
  permission?: string;
  auth?: boolean;
  body?: ZodType;
  query?: ZodType;
  multipart?: boolean;
}

const E = (method: Endpoint['method'], path: string, tag: string, summary: string, extra: Partial<Endpoint> = {}): Endpoint => ({ method, path, tag, summary, auth: true, ...extra });

const ENDPOINTS: Endpoint[] = [
  // Auth
  E('post', '/auth/login', 'Auth', 'Sign in with email/phone and password', { auth: false, body: S.loginSchema }),
  E('post', '/auth/refresh', 'Auth', 'Rotate refresh token and get a new access token', { auth: false, body: S.refreshSchema }),
  E('post', '/auth/logout', 'Auth', 'Revoke current session'),
  E('post', '/auth/forgot-password', 'Auth', 'Request a password reset (no account enumeration)', { auth: false, body: S.forgotPasswordSchema }),
  E('post', '/auth/reset-password', 'Auth', 'Reset password with a one-time token', { auth: false, body: S.resetPasswordSchema }),
  E('post', '/auth/invitations/lookup', 'Auth', 'Describe an invitation before accepting', { auth: false }),
  E('post', '/auth/invitations/accept', 'Auth', 'Accept a staff/patient/caregiver invitation and activate account', { auth: false, body: S.acceptInvitationSchema }),
  E('get', '/auth/me', 'Auth', 'Current user, memberships, permissions'),
  E('patch', '/auth/me', 'Auth', 'Update own preferences'),
  E('post', '/auth/change-password', 'Auth', 'Change password (revokes other sessions)', { body: S.changePasswordSchema }),
  E('post', '/auth/verification/request', 'Auth', 'Send email/SMS verification code', { body: S.requestVerificationSchema }),
  E('post', '/auth/verification/confirm', 'Auth', 'Confirm verification code', { body: S.confirmVerificationSchema }),
  E('get', '/auth/sessions', 'Auth', 'List active device sessions'),
  E('delete', '/auth/sessions/{id}', 'Auth', 'Revoke a device session'),
  E('post', '/auth/switch-hospital', 'Auth', 'Switch active hospital context'),
  E('post', '/auth/push-token', 'Auth', 'Register/clear device push token'),
  // Hospitals
  E('post', '/hospitals/register', 'Hospitals', 'Register a hospital (pending verification)', { auth: false, body: S.registerHospitalSchema }),
  E('get', '/hospitals/me', 'Hospitals', 'Current hospital profile and settings'),
  E('get', '/hospitals/me/public', 'Hospitals', 'Hospital contact and emergency guidance'),
  E('patch', '/hospitals/me', 'Hospitals', 'Update hospital profile/settings', { permission: 'hospital.settings.manage', body: S.updateHospitalSchema }),
  E('get', '/hospitals/me/subscription', 'Billing', 'Subscription, entitlements, usage and invoices', { permission: 'billing.manage' }),
  E('get', '/hospitals/departments', 'Hospitals', 'List departments'),
  E('post', '/hospitals/departments', 'Hospitals', 'Create department', { permission: 'hospital.settings.manage', body: S.createDepartmentSchema }),
  E('get', '/hospitals/staff', 'Staff', 'List staff'),
  E('post', '/hospitals/staff/invitations', 'Staff', 'Invite staff member', { permission: 'users.manage', body: S.inviteStaffSchema }),
  E('patch', '/hospitals/staff/{id}', 'Staff', 'Update staff roles/departments', { permission: 'users.manage', body: S.updateStaffSchema }),
  E('post', '/hospitals/staff/{id}/status', 'Staff', 'Suspend/reactivate/revoke staff', { permission: 'users.manage' }),
  E('post', '/hospitals/break-glass', 'Access', 'Emergency (break-glass) access with justification', { body: S.breakGlassSchema }),
  E('get', '/platform/hospitals', 'Platform', 'List hospitals (platform operators)', { permission: 'platform.hospitals.manage' }),
  E('post', '/platform/hospitals/{id}/verification', 'Platform', 'Verify/reject/suspend hospital', { permission: 'platform.hospitals.manage' }),
  E('post', '/platform/hospitals/{id}/subscription/plan', 'Platform', 'Change hospital plan', { permission: 'platform.subscriptions.manage' }),
  E('post', '/platform/hospitals/{id}/invoices', 'Platform', 'Issue invoice', { permission: 'platform.subscriptions.manage' }),
  E('post', '/platform/hospitals/{id}/invoices/{invoiceId}/mark-paid', 'Platform', 'Record verified payment', { permission: 'platform.subscriptions.manage' }),
  // Patients
  E('get', '/patients', 'Patients', 'Search patients (scoped to access)', { permission: 'patients.read', query: S.patientSearchQuery }),
  E('post', '/patients', 'Patients', 'Register patient', { permission: 'patients.create', body: S.createPatientSchema }),
  E('get', '/patients/me', 'Patients', 'My patient profiles (patient)'),
  E('get', '/patients/{id}', 'Patients', 'Patient profile and episodes'),
  E('patch', '/patients/{id}', 'Patients', 'Update patient', { permission: 'patients.update', body: S.updatePatientSchema }),
  E('post', '/patients/{id}/invitation', 'Patients', 'Invite patient to activate app account', { permission: 'patients.update' }),
  E('get', '/patients/{id}/care-team', 'Patients', 'Patient care team'),
  // Episodes
  E('get', '/recovery-episodes', 'Recovery episodes', 'List episodes (scoped)', { permission: 'recovery.read' }),
  E('post', '/recovery-episodes', 'Recovery episodes', 'Create episode', { permission: 'recovery.create', body: S.createEpisodeSchema }),
  E('get', '/recovery-episodes/{id}', 'Recovery episodes', 'Episode detail, care team, today progress', { permission: 'recovery.read' }),
  E('patch', '/recovery-episodes/{id}', 'Recovery episodes', 'Update episode references', { permission: 'recovery.update', body: S.updateEpisodeSchema }),
  E('post', '/recovery-episodes/{id}/transitions', 'Recovery episodes', 'Controlled status transition (complete/extend/transfer…)', { permission: 'recovery.update', body: S.episodeTransitionSchema }),
  E('post', '/recovery-episodes/{id}/care-team', 'Recovery episodes', 'Assign care-team member', { permission: 'patients.assign', body: S.assignCareTeamSchema }),
  E('delete', '/recovery-episodes/{id}/care-team/{assignmentId}', 'Recovery episodes', 'Remove care-team member', { permission: 'patients.assign' }),
  E('get', '/recovery-episodes/{id}/tasks', 'Recovery tasks', 'Episode tasks', { query: S.taskListQuery }),
  E('get', '/recovery-episodes/{id}/tasks/today', 'Recovery tasks', "Today's tasks for an episode"),
  E('get', '/recovery-episodes/{id}/medications', 'Medications', 'Approved medication orders and schedules', { permission: 'medication.read' }),
  E('get', '/recovery-episodes/{id}/medication-events', 'Medications', 'Patient-reported dose events', { permission: 'medication.read' }),
  E('get', '/recovery-episodes/{id}/check-ins', 'Check-ins', 'Episode check-ins'),
  E('get', '/recovery-episodes/{id}/discharge-plan', 'Discharge', 'Discharge plan for episode'),
  // Discharge
  E('post', '/discharge-plans', 'Discharge', 'Create draft discharge plan', { permission: 'discharge.create', body: S.createDischargePlanSchema }),
  E('get', '/discharge-plans/pending-approval', 'Discharge', 'Plans awaiting my approval', { permission: 'discharge.approve' }),
  E('get', '/discharge-plans/{id}', 'Discharge', 'Discharge plan (patients see approved version only)'),
  E('patch', '/discharge-plans/{id}', 'Discharge', 'Edit working draft', { permission: 'discharge.create', body: S.updateDischargePlanSchema }),
  E('post', '/discharge-plans/{id}/submit', 'Discharge', 'Submit draft for approval', { permission: 'discharge.create', body: S.submitDischargePlanSchema }),
  E('post', '/discharge-plans/{id}/approve', 'Discharge', 'Approve/reject; approval activates recovery programme', { permission: 'discharge.approve', body: S.approveDischargePlanSchema }),
  E('post', '/discharge-plans/{id}/amendments', 'Discharge', 'Start amendment (new version)', { permission: 'discharge.create' }),
  E('post', '/discharge-plans/{id}/patient-understanding', 'Discharge', 'Record patient understanding', { permission: 'discharge.review', body: S.recordUnderstandingSchema }),
  // Plans & tasks
  E('get', '/recovery-plans/{id}', 'Recovery tasks', 'Recovery plan activity definitions'),
  E('get', '/recovery-tasks/today', 'Recovery tasks', "Patient/caregiver: today's tasks"),
  E('post', '/recovery-tasks/{id}/complete', 'Recovery tasks', 'Complete/skip a task (medication = patient-reported)', { body: S.completeTaskSchema }),
  E('post', '/recovery-tasks/{id}/assign', 'Recovery tasks', 'Assign task to staff', { permission: 'recovery.update' }),
  // Check-ins & symptoms
  E('post', '/check-ins', 'Check-ins', 'Submit check-in (idempotent); returns safety messages', { permission: 'checkins.create', body: S.submitCheckInSchema }),
  E('get', '/check-ins/review-queue', 'Check-ins', 'Check-ins awaiting staff review', { permission: 'checkins.read' }),
  E('get', '/check-ins/missed', 'Check-ins', 'Missed check-in queue', { permission: 'checkins.read' }),
  E('get', '/check-ins/{id}', 'Check-ins', 'Check-in detail'),
  E('post', '/check-ins/{id}/review', 'Check-ins', 'Mark reviewed with clinician note', { body: S.reviewSchema }),
  E('get', '/check-in-templates', 'Check-ins', 'Active check-in templates'),
  E('post', '/check-in-templates', 'Check-ins', 'Create template (draft)', { permission: 'checkins.templates.manage', body: S.createCheckInTemplateSchema }),
  E('put', '/check-in-templates/{id}', 'Check-ins', 'Revise template (new version if active)', { permission: 'checkins.templates.manage', body: S.createCheckInTemplateSchema }),
  E('post', '/check-in-templates/{id}/approve', 'Check-ins', 'Clinically approve template', { permission: 'alerts.rules.approve' }),
  E('post', '/symptoms', 'Symptoms', 'Report symptom (idempotent); returns safety messages', { permission: 'checkins.create', body: S.submitSymptomSchema }),
  E('get', '/symptoms', 'Symptoms', 'List symptom reports'),
  E('get', '/symptoms/{id}', 'Symptoms', 'Symptom report'),
  E('post', '/symptoms/{id}/review', 'Symptoms', 'Review symptom report', { body: S.reviewSchema }),
  // Medication
  E('post', '/medication-events', 'Medications', 'Report dose status (patient-reported, idempotent)', { body: S.medicationEventSchema }),
  E('get', '/medication-concerns', 'Medications', 'Pharmacist review queue', { permission: 'medication.review' }),
  E('post', '/medication-events/{id}/review', 'Medications', 'Complete pharmacist review', { permission: 'medication.review' }),
  E('post', '/medication-orders/{id}/discontinue', 'Medications', 'Discontinue a medication order', { permission: 'medication.manage' }),
  // Alerts
  E('get', '/alerts', 'Alerts', 'Alert work queue', { permission: 'alerts.read', query: S.alertListQuery }),
  E('post', '/alerts', 'Alerts', 'Raise manual alert', { permission: 'alerts.acknowledge', body: S.createManualAlertSchema }),
  E('get', '/alerts/{id}', 'Alerts', 'Alert detail with full event history', { permission: 'alerts.read' }),
  E('post', '/alerts/{id}/acknowledge', 'Alerts', 'Acknowledge alert (stops escalation timer)', { permission: 'alerts.acknowledge' }),
  E('post', '/alerts/{id}/assign', 'Alerts', 'Assign alert', { permission: 'alerts.assign', body: S.assignAlertSchema }),
  E('post', '/alerts/{id}/actions', 'Alerts', 'Record action / patient contact', { permission: 'alerts.acknowledge', body: S.alertActionSchema }),
  E('post', '/alerts/{id}/resolve', 'Alerts', 'Resolve with documented outcome', { permission: 'alerts.resolve', body: S.resolveAlertSchema }),
  E('post', '/alerts/{id}/close', 'Alerts', 'Close resolved alert', { permission: 'alerts.resolve' }),
  E('get', '/alerts/rules', 'Alert rules', 'List alert rules'),
  E('post', '/alerts/rules', 'Alert rules', 'Draft alert rule', { permission: 'alerts.rules.manage', body: S.createAlertRuleSchema }),
  E('put', '/alerts/rules/{id}', 'Alert rules', 'Edit draft rule', { permission: 'alerts.rules.manage', body: S.createAlertRuleSchema }),
  E('post', '/alerts/rules/{id}/submit', 'Alert rules', 'Submit rule for clinical approval', { permission: 'alerts.rules.manage' }),
  E('post', '/alerts/rules/{id}/approve', 'Alert rules', 'Clinically approve rule (not by its author)', { permission: 'alerts.rules.approve' }),
  E('post', '/alerts/rules/{id}/retire', 'Alert rules', 'Retire rule'),
  // Appointments
  E('get', '/appointments', 'Appointments', 'List appointments', { permission: 'appointments.read' }),
  E('post', '/appointments', 'Appointments', 'Create appointment', { permission: 'appointments.manage', body: S.createAppointmentSchema }),
  E('get', '/appointments/{id}', 'Appointments', 'Appointment detail'),
  E('patch', '/appointments/{id}', 'Appointments', 'Reschedule/cancel/record attendance/notes', { permission: 'appointments.manage', body: S.updateAppointmentSchema }),
  E('post', '/appointments/{id}/respond', 'Appointments', 'Patient confirm / request reschedule', { body: S.appointmentResponseSchema }),
  // Rehab
  E('get', '/rehabilitation/plans', 'Rehabilitation', 'List rehabilitation plans', { permission: 'rehabilitation.read' }),
  E('post', '/rehabilitation/plans', 'Rehabilitation', 'Create plan (clinician-authored exercises)', { permission: 'rehabilitation.manage', body: S.createRehabPlanSchema }),
  E('get', '/rehabilitation/plans/{id}', 'Rehabilitation', 'Plan with sessions and attendance'),
  E('patch', '/rehabilitation/plans/{id}', 'Rehabilitation', 'Update plan / add review note', { permission: 'rehabilitation.manage' }),
  E('post', '/rehabilitation/plans/{id}/milestones/{milestoneId}/achieve', 'Rehabilitation', 'Confirm milestone', { permission: 'rehabilitation.manage' }),
  E('get', '/rehabilitation/sessions', 'Rehabilitation', 'List sessions'),
  E('post', '/rehabilitation/sessions', 'Rehabilitation', 'Schedule session', { permission: 'rehabilitation.manage', body: S.createRehabSessionSchema }),
  E('post', '/rehabilitation/sessions/{id}/record', 'Rehabilitation', 'Record attendance & assessment', { permission: 'rehabilitation.manage', body: S.recordRehabSessionSchema }),
  E('post', '/rehabilitation/sessions/{id}/difficulty', 'Rehabilitation', 'Patient-reported difficulty', { body: S.rehabDifficultySchema }),
  // Caregivers / consent
  E('get', '/caregivers', 'Caregivers', 'List caregivers for a patient'),
  E('get', '/caregivers/me', 'Caregivers', 'Caregiver: patients I support'),
  E('post', '/caregivers/invitations', 'Caregivers', 'Invite caregiver with scoped consent'),
  E('patch', '/caregivers/{id}/scopes', 'Caregivers', 'Change caregiver permissions', { body: S.updateCaregiverScopesSchema }),
  E('post', '/caregivers/{id}/revoke', 'Caregivers', 'Revoke caregiver access', { body: S.revokeConsentSchema }),
  E('get', '/caregivers/{id}/access-history', 'Caregivers', 'Caregiver access history'),
  E('get', '/consents', 'Consent', 'List patient consents'),
  E('post', '/consents', 'Consent', 'Grant consent', { body: S.grantConsentSchema }),
  E('post', '/consents/{id}/revoke', 'Consent', 'Revoke consent', { body: S.revokeConsentSchema }),
  // Messaging
  E('get', '/conversations', 'Messaging', 'List conversations'),
  E('post', '/conversations', 'Messaging', 'Start conversation', { body: S.createConversationSchema }),
  E('get', '/conversations/{id}/messages', 'Messaging', 'Messages (marks as read)'),
  E('post', '/conversations/{id}/messages', 'Messaging', 'Send message / call-back request', { body: S.sendMessageSchema }),
  E('post', '/conversations/{id}/assign', 'Messaging', 'Assign conversation', { body: S.assignConversationSchema }),
  E('post', '/conversations/{id}/escalate', 'Messaging', 'Escalate conversation into alert workflow'),
  E('post', '/conversations/{id}/close', 'Messaging', 'Close conversation'),
  // Documents
  E('get', '/documents', 'Documents', 'List documents'),
  E('post', '/documents', 'Documents', 'Upload document (multipart, content-sniffed)', { multipart: true }),
  E('get', '/documents/{id}/download-url', 'Documents', 'Expiring download link (5 min)'),
  E('delete', '/documents/{id}', 'Documents', 'Delete document', { permission: 'documents.manage' }),
  // AI
  E('post', '/ai/explain-instructions', 'AI', 'Plain-language explanation of an approved instruction', { body: S.aiExplainSchema }),
  E('post', '/ai/classify-message', 'AI', 'Structure a patient message for routing (suggestion only)', { body: S.aiClassifySchema }),
  E('post', '/ai/summarise-recovery', 'AI', 'Staff summary of patient-reported data', { body: S.aiSummariseSchema }),
  E('get', '/ai/recovery-insights/{id}', 'AI', 'Operational pattern observations for an episode'),
  E('post', '/ai/transcribe', 'AI', 'Transcribe a voice message (consent required)'),
  E('post', '/ai/interactions/{id}/review', 'AI', 'Accept/correct AI output'),
  // Analytics, audit, notifications
  E('get', '/analytics/dashboard', 'Analytics', 'Hospital dashboard (activity vs outcomes)', { permission: 'reports.read', query: S.analyticsQuery }),
  E('get', '/analytics/my-workload', 'Analytics', 'My work-queue counters'),
  E('post', '/analytics/satisfaction', 'Analytics', 'Patient satisfaction response', { body: S.satisfactionSchema }),
  E('get', '/audit-logs', 'Audit', 'Search audit trail', { permission: 'audit.read' }),
  E('get', '/notifications', 'Notifications', 'In-app notifications'),
  E('post', '/notifications/read', 'Notifications', 'Mark notifications read'),
];

function toSchema(schema: ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } }));
    if (e.query) {
      const qs = toSchema(e.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(qs.properties ?? {})) params.push({ name, in: 'query', required: (qs.required ?? []).includes(name), schema } as never);
    }
    const op: Record<string, unknown> = {
      tags: [e.tag],
      summary: e.summary,
      description: e.permission ? `Requires permission \`${e.permission}\` plus record-level (tenant, care-team/department, consent) access.` : undefined,
      parameters: params,
      security: e.auth ? [{ bearerAuth: [] }] : [],
      responses: {
        '200': { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } } },
        '400': { $ref: '#/components/responses/Error' },
        '401': { $ref: '#/components/responses/Error' },
        '403': { $ref: '#/components/responses/Error' },
        '404': { $ref: '#/components/responses/Error' },
        '409': { $ref: '#/components/responses/Error' },
      },
    };
    if (e.body) op.requestBody = { required: true, content: { 'application/json': { schema: toSchema(e.body) } } };
    if (e.multipart) {
      op.requestBody = {
        required: true,
        content: { 'multipart/form-data': { schema: { type: 'object', required: ['file', 'type', 'title'], properties: { file: { type: 'string', format: 'binary' }, type: { type: 'string', enum: [...S.DOCUMENT_TYPES] }, title: { type: 'string' }, episodeId: { type: 'string' }, patientId: { type: 'string' }, visibility: { type: 'string', enum: ['STAFF_ONLY', 'PATIENT_VISIBLE'] } } } } },
      };
    }
    paths[`/api/v1${e.path}`] ??= {};
    paths[`/api/v1${e.path}`]![e.method] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'RecoverOS API',
      version: '1.0.0',
      description:
        'Hospital-connected recovery coordination platform. All endpoints are tenant-isolated. Optional headers: `X-Hospital-Id` (select one of your authorised hospitals), `X-Acting-As` (STAFF|PATIENT|CAREGIVER), `X-Request-Id`.',
    },
    servers: [{ url: env.API_BASE_URL }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Success: { type: 'object', properties: { success: { const: true }, data: {}, meta: { type: 'object' }, requestId: { type: 'string' } } },
        Error: {
          type: 'object',
          properties: {
            success: { const: false },
            error: { type: 'object', properties: { code: { type: 'string', enum: [...S.ERROR_CODES] }, message: { type: 'string' }, details: {} } },
            requestId: { type: 'string' },
          },
        },
      },
      responses: { Error: { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } },
    },
  };
}

export const DOCUMENTED_ENDPOINT_COUNT = ENDPOINTS.length;
