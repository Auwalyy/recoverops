import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  achieveMilestoneSchema,
  aiClassifySchema,
  aiExplainSchema,
  aiSummariseSchema,
  analyticsQuery,
  appointmentResponseSchema,
  assignConversationSchema,
  createAppointmentSchema,
  createConversationSchema,
  createRehabPlanSchema,
  createRehabSessionSchema,
  exerciseSchema,
  grantConsentSchema,
  inviteCaregiverSchema,
  objectId,
  paginationQuery,
  recordRehabSessionSchema,
  rehabDifficultySchema,
  revokeConsentSchema,
  satisfactionSchema,
  sendMessageSchema,
  updateAppointmentSchema,
  updateCaregiverScopesSchema,
  ALERT_PRIORITIES,
} from '@recoveros/shared';
import { env } from '../config/env';
import { authenticate, principalOf, requireKind, requirePermission } from '../middleware/auth';
import { idParams, validate } from '../middleware/validate';
import { aiRateLimit } from '../middleware/rate-limit';
import { created, ok, pageMeta, paginated, validated } from '../utils/http';
import { errors } from '../utils/errors';
import * as appointments from './appointments/appointment.service';
import * as rehab from './rehabilitation/rehabilitation.service';
import * as caregivers from './caregivers/caregiver.service';
import * as messaging from './messaging/messaging.service';
import * as documents from './documents/document.service';
import * as analytics from './analytics/analytics.service';
import * as ai from '../integrations/ai/ai.service';
import { storage, verifyLocalDownloadToken } from '../integrations/storage/storage';
import { AuditLogModel } from './audit/audit.model';
import { NotificationModel } from './notifications/notification.model';
import { requireTenant } from './access/principal';
import { assertPermission } from './access/access.service';

const id = (req: Request) => validated<{ id: string }>(req, 'params').id;
const listQuery = (extra: z.ZodRawShape = {}) =>
  z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), ...extra });

/* ----------------------------- Appointments ----------------------------- */
const appointmentRouter = Router();
appointmentRouter.use(authenticate());
appointmentRouter.get(
  '/',
  validate({ query: listQuery({ episodeId: objectId.optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), status: z.string().optional(), mine: z.coerce.boolean().optional() }) }),
  async (req: Request, res: Response) => {
    const r = await appointments.listAppointments(principalOf(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
);
appointmentRouter.post('/', requirePermission('appointments.manage'), validate({ body: createAppointmentSchema }), async (req: Request, res: Response) =>
  created(res, { appointment: await appointments.createAppointment(principalOf(req), validated(req, 'body')) }),
);
appointmentRouter.get('/:id', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, { appointment: await appointments.getAppointment(principalOf(req), id(req)) }));
appointmentRouter.patch('/:id', requirePermission('appointments.manage'), validate({ params: idParams, body: updateAppointmentSchema }), async (req: Request, res: Response) =>
  ok(res, { appointment: await appointments.updateAppointment(principalOf(req), id(req), validated(req, 'body')) }),
);
appointmentRouter.post('/:id/respond', requireKind('PATIENT', 'CAREGIVER'), validate({ params: idParams, body: appointmentResponseSchema }), async (req: Request, res: Response) =>
  ok(res, { appointment: await appointments.respondToAppointment(principalOf(req), id(req), validated(req, 'body')) }),
);

/* ---------------------------- Rehabilitation ---------------------------- */
const rehabRouter = Router();
rehabRouter.use(authenticate());
rehabRouter.get('/plans', validate({ query: z.object({ episodeId: objectId.optional(), mine: z.coerce.boolean().optional() }) }), async (req: Request, res: Response) =>
  ok(res, { plans: await rehab.listPlans(principalOf(req), validated(req, 'query')) }),
);
rehabRouter.post('/plans', requirePermission('rehabilitation.manage'), validate({ body: createRehabPlanSchema }), async (req: Request, res: Response) =>
  created(res, { plan: await rehab.createPlan(principalOf(req), validated(req, 'body')) }),
);
rehabRouter.get('/plans/:id', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, await rehab.getPlan(principalOf(req), id(req))));
rehabRouter.patch(
  '/plans/:id',
  requirePermission('rehabilitation.manage'),
  validate({ params: idParams, body: z.object({ exercises: z.array(exerciseSchema).max(30).optional(), goals: z.array(z.string().min(1).max(200)).max(20).optional(), status: z.enum(['ACTIVE', 'COMPLETED', 'DISCONTINUED']).optional(), reviewNote: z.string().max(5000).optional(), endDate: z.iso.date().optional() }) }),
  async (req: Request, res: Response) => ok(res, { plan: await rehab.updatePlan(principalOf(req), id(req), validated(req, 'body')) }),
);
rehabRouter.post(
  '/plans/:id/milestones/:milestoneId/achieve',
  requirePermission('rehabilitation.manage'),
  validate({ params: z.object({ id: objectId, milestoneId: objectId }), body: achieveMilestoneSchema }),
  async (req: Request, res: Response) => {
    const prm = validated<{ id: string; milestoneId: string }>(req, 'params');
    ok(res, { plan: await rehab.achieveMilestone(principalOf(req), prm.id, prm.milestoneId, validated<{ notes?: string }>(req, 'body').notes) });
  },
);
rehabRouter.get('/sessions', validate({ query: listQuery({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), mine: z.coerce.boolean().optional() }) }), async (req: Request, res: Response) => {
  const r = await rehab.listSessions(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
rehabRouter.post('/sessions', requirePermission('rehabilitation.manage'), validate({ body: createRehabSessionSchema }), async (req: Request, res: Response) =>
  created(res, { session: await rehab.scheduleSession(principalOf(req), validated(req, 'body')) }),
);
rehabRouter.post('/sessions/:id/record', requirePermission('rehabilitation.manage'), validate({ params: idParams, body: recordRehabSessionSchema }), async (req: Request, res: Response) =>
  ok(res, { session: await rehab.recordSession(principalOf(req), id(req), validated(req, 'body')) }),
);
rehabRouter.post('/sessions/:id/difficulty', requireKind('PATIENT', 'CAREGIVER'), validate({ params: idParams, body: rehabDifficultySchema }), async (req: Request, res: Response) =>
  ok(res, { session: await rehab.reportDifficulty(principalOf(req), id(req), validated(req, 'body')) }),
);

/* ------------------------------ Caregivers ------------------------------ */
const caregiverRouter = Router();
caregiverRouter.use(authenticate());
caregiverRouter.get('/', validate({ query: z.object({ patientId: objectId.optional() }) }), async (req: Request, res: Response) =>
  ok(res, { caregivers: await caregivers.listCaregivers(principalOf(req), validated<{ patientId?: string }>(req, 'query').patientId) }),
);
caregiverRouter.get('/me', requireKind('CAREGIVER'), async (req: Request, res: Response) => ok(res, { grants: await caregivers.myCaregiverGrants(principalOf(req)) }));
caregiverRouter.post('/invitations', requireKind('PATIENT', 'STAFF'), validate({ body: inviteCaregiverSchema }), async (req: Request, res: Response) =>
  created(res, await caregivers.inviteCaregiver(principalOf(req), validated(req, 'body'))),
);
caregiverRouter.patch('/:id/scopes', validate({ params: idParams, body: updateCaregiverScopesSchema }), async (req: Request, res: Response) =>
  ok(res, { consent: await caregivers.updateScopes(principalOf(req), id(req), validated<{ scopes: string[] }>(req, 'body').scopes) }),
);
caregiverRouter.post('/:id/revoke', validate({ params: idParams, body: revokeConsentSchema }), async (req: Request, res: Response) =>
  ok(res, { consent: await caregivers.revokeCaregiver(principalOf(req), id(req), validated<{ reason?: string }>(req, 'body').reason) }),
);
caregiverRouter.get('/:id/access-history', validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { history: await caregivers.caregiverAccessHistory(principalOf(req), id(req)) }),
);

/* -------------------------------- Consents -------------------------------- */
const consentRouter = Router();
consentRouter.use(authenticate(), requireKind('PATIENT', 'STAFF'));
consentRouter.get('/', validate({ query: z.object({ patientId: objectId.optional() }) }), async (req: Request, res: Response) =>
  ok(res, { consents: await caregivers.listConsents(principalOf(req), validated<{ patientId?: string }>(req, 'query').patientId) }),
);
consentRouter.post('/', validate({ body: grantConsentSchema }), async (req: Request, res: Response) => created(res, { consent: await caregivers.grantConsent(principalOf(req), validated(req, 'body')) }));
consentRouter.post('/:id/revoke', validate({ params: idParams, body: revokeConsentSchema }), async (req: Request, res: Response) =>
  ok(res, { consent: await caregivers.revokeConsent(principalOf(req), id(req), validated<{ reason?: string }>(req, 'body').reason) }),
);

/* -------------------------------- Messaging -------------------------------- */
const conversationRouter = Router();
conversationRouter.use(authenticate());
conversationRouter.get('/', validate({ query: listQuery({ patientId: objectId.optional(), status: z.enum(['OPEN', 'CLOSED']).optional(), assignedToMe: z.coerce.boolean().optional() }) }), async (req: Request, res: Response) => {
  const r = await messaging.listConversations(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
conversationRouter.post('/', validate({ body: createConversationSchema.extend({ participantUserIds: z.array(objectId).max(20).optional() }) }), async (req: Request, res: Response) =>
  created(res, { conversation: await messaging.createConversation(principalOf(req), validated(req, 'body')) }),
);
conversationRouter.get('/:id/messages', validate({ params: idParams, query: z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }) }), async (req: Request, res: Response) => {
  const r = await messaging.getMessages(principalOf(req), id(req), validated(req, 'query'));
  ok(res, { conversation: r.conversation, messages: r.items }, 200, { ...r.meta });
});
conversationRouter.post('/:id/messages', validate({ params: idParams, body: sendMessageSchema }), async (req: Request, res: Response) =>
  created(res, { message: await messaging.sendMessage(principalOf(req), id(req), validated(req, 'body')) }),
);
conversationRouter.post('/:id/assign', requireKind('STAFF'), validate({ params: idParams, body: assignConversationSchema }), async (req: Request, res: Response) =>
  ok(res, { conversation: await messaging.assignConversation(principalOf(req), id(req), validated<{ userId: string }>(req, 'body').userId) }),
);
conversationRouter.post('/:id/escalate', requireKind('STAFF'), validate({ params: idParams, body: z.object({ priority: z.enum(ALERT_PRIORITIES), reason: z.string().trim().min(3).max(2000) }) }), async (req: Request, res: Response) =>
  created(res, await messaging.escalateConversation(principalOf(req), id(req), validated(req, 'body'))),
);
conversationRouter.post('/:id/close', requireKind('STAFF'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { conversation: await messaging.closeConversation(principalOf(req), id(req)) }),
);

/* -------------------------------- Documents -------------------------------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
const documentRouter = Router();
// Signed local download (dev storage driver). The token itself is the authorisation.
documentRouter.get('/files/:token', async (req: Request, res: Response) => {
  const key = verifyLocalDownloadToken(String(req.params.token));
  if (!key) throw errors.notFound('File');
  const buf = await storage().read(key);
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
});
documentRouter.use(authenticate());
documentRouter.get('/', validate({ query: z.object({ episodeId: objectId.optional(), patientId: objectId.optional() }) }), async (req: Request, res: Response) =>
  ok(res, { documents: await documents.listDocuments(principalOf(req), validated(req, 'query')) }),
);
documentRouter.post(
  '/',
  upload.single('file'),
  validate({ body: z.object({ episodeId: objectId.optional(), patientId: objectId.optional(), type: z.enum(DOCUMENT_TYPES), title: z.string().trim().min(1).max(200), visibility: z.enum(['STAFF_ONLY', 'PATIENT_VISIBLE']).optional() }) }),
  async (req: Request, res: Response) => created(res, { document: await documents.uploadDocument(principalOf(req), req.file, validated(req, 'body')) }),
);
documentRouter.get('/:id/download-url', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, await documents.getDownloadUrl(principalOf(req), id(req))));
documentRouter.delete('/:id', requirePermission('documents.manage'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { document: await documents.deleteDocument(principalOf(req), id(req)) }),
);

/* ----------------------------------- AI ----------------------------------- */
const aiRouter = Router();
aiRouter.use(authenticate(), aiRateLimit);
aiRouter.post('/explain-instructions', validate({ body: aiExplainSchema }), async (req: Request, res: Response) => ok(res, await ai.explainInstruction(principalOf(req), validated(req, 'body'))));
aiRouter.post('/classify-message', requireKind('STAFF'), validate({ body: aiClassifySchema }), async (req: Request, res: Response) =>
  ok(res, await ai.classifyMessage(principalOf(req), validated<{ messageId: string }>(req, 'body').messageId)),
);
aiRouter.post('/summarise-recovery', requireKind('STAFF'), validate({ body: aiSummariseSchema }), async (req: Request, res: Response) => ok(res, await ai.summariseRecovery(principalOf(req), validated(req, 'body'))));
aiRouter.get('/recovery-insights/:id', requireKind('STAFF'), validate({ params: idParams }), async (req: Request, res: Response) => ok(res, await ai.patternInsights(principalOf(req), id(req))));
aiRouter.post('/transcribe', validate({ body: z.object({ documentId: objectId }) }), async (req: Request, res: Response) =>
  ok(res, await ai.transcribeVoice(principalOf(req), validated<{ documentId: string }>(req, 'body').documentId)),
);
aiRouter.post('/interactions/:id/review', validate({ params: idParams, body: z.object({ accepted: z.boolean(), correctedOutput: z.unknown().optional() }) }), async (req: Request, res: Response) =>
  ok(res, { interaction: await ai.reviewInteraction(principalOf(req), id(req), validated(req, 'body')) }),
);

/* -------------------------------- Analytics -------------------------------- */
const analyticsRouter = Router();
analyticsRouter.use(authenticate());
analyticsRouter.get('/dashboard', requirePermission('reports.read'), validate({ query: analyticsQuery }), async (req: Request, res: Response) =>
  ok(res, await analytics.hospitalDashboard(principalOf(req), validated(req, 'query'))),
);
analyticsRouter.get('/my-workload', requireKind('STAFF'), async (req: Request, res: Response) => ok(res, await analytics.myWorkload(principalOf(req))));
analyticsRouter.post('/satisfaction', requireKind('PATIENT'), validate({ body: satisfactionSchema }), async (req: Request, res: Response) =>
  created(res, { response: await analytics.submitSatisfaction(principalOf(req), validated(req, 'body')) }),
);

/* ---------------------------------- Audit ---------------------------------- */
const auditRouter = Router();
auditRouter.use(authenticate(), requireKind('STAFF'), requirePermission('audit.read'));
auditRouter.get(
  '/',
  validate({ query: listQuery({ action: z.string().max(80).optional(), patientId: objectId.optional(), actorId: objectId.optional(), breakGlass: z.coerce.boolean().optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }) }),
  async (req: Request, res: Response) => {
    const p = principalOf(req);
    assertPermission(p, 'audit.read');
    const q = validated<{ page: number; limit: number; action?: string; patientId?: string; actorId?: string; breakGlass?: boolean; from?: string; to?: string }>(req, 'query');
    const filter: Record<string, unknown> = { hospitalId: requireTenant(p) };
    if (q.action) filter.action = q.action;
    if (q.patientId) filter.patientId = q.patientId;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.breakGlass) filter.breakGlass = true;
    if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(q.to) } : {}) };
    const [items, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).populate('actorId', 'firstName lastName'),
      AuditLogModel.countDocuments(filter),
    ]);
    paginated(res, items, pageMeta(q.page, q.limit, total));
  },
);

/* ------------------------------ Notifications ------------------------------ */
const notificationRouter = Router();
notificationRouter.use(authenticate({ allowNoContext: true }));
notificationRouter.get('/', validate({ query: paginationQuery.extend({ unreadOnly: z.coerce.boolean().optional() }) }), async (req: Request, res: Response) => {
  const q = validated<{ page: number; limit: number; unreadOnly?: boolean }>(req, 'query');
  const filter: Record<string, unknown> = { userId: req.auth!.userId, channel: 'IN_APP' };
  if (q.unreadOnly) filter.readAt = { $exists: false };
  const [items, total, unread] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ userId: req.auth!.userId, channel: 'IN_APP', readAt: { $exists: false } }),
  ]);
  res.json({ success: true, data: items, meta: { ...pageMeta(q.page, q.limit, total), unread }, requestId: res.locals.requestId });
});
notificationRouter.post('/read', validate({ body: z.object({ ids: z.array(objectId).max(100).optional(), all: z.boolean().optional() }) }), async (req: Request, res: Response) => {
  const body = validated<{ ids?: string[]; all?: boolean }>(req, 'body');
  const filter: Record<string, unknown> = { userId: req.auth!.userId, channel: 'IN_APP', readAt: { $exists: false } };
  if (!body.all) filter._id = { $in: body.ids ?? [] };
  const r = await NotificationModel.updateMany(filter, { $set: { readAt: new Date(), status: 'READ' } });
  ok(res, { updated: r.modifiedCount });
});

export const extendedRouters: Array<[string, Router]> = [
  ['/appointments', appointmentRouter],
  ['/rehabilitation', rehabRouter],
  ['/caregivers', caregiverRouter],
  ['/consents', consentRouter],
  ['/conversations', conversationRouter],
  ['/documents', documentRouter],
  ['/ai', aiRouter],
  ['/analytics', analyticsRouter],
  ['/audit-logs', auditRouter],
  ['/notifications', notificationRouter],
];
