import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ALERT_RULE_STATUSES,
  alertActionSchema,
  alertListQuery,
  assignAlertSchema,
  createAlertRuleSchema,
  createCheckInTemplateSchema,
  createManualAlertSchema,
  medicationEventSchema,
  objectId,
  paginationQuery,
  resolveAlertSchema,
  reviewSchema,
  submitCheckInSchema,
  submitSymptomSchema,
} from '@recoveros/shared';
import { authenticate, principalOf, requireKind, requirePermission } from '../middleware/auth';
import { idParams, validate } from '../middleware/validate';
import { created, ok, paginated, validated } from '../utils/http';
import * as checkins from './checkins/checkin.service';
import * as alerts from './alerts/alert.service';
import * as meds from './medications/medication.service';

const id = (req: Request) => validated<{ id: string }>(req, 'params').id;
const notes = (req: Request) => validated<{ notes?: string }>(req, 'body').notes;

/* ------------------------------- Check-ins ------------------------------- */
export const checkInRouter = Router();
checkInRouter.use(authenticate());
checkInRouter.post('/', requirePermission('checkins.create'), validate({ body: submitCheckInSchema }), async (req: Request, res: Response) => {
  const r = await checkins.submitCheckIn(principalOf(req), validated(req, 'body'));
  ok(res, r, r.duplicate ? 200 : 201);
});
checkInRouter.get('/review-queue', requireKind('STAFF'), validate({ query: paginationQuery }), async (req: Request, res: Response) => {
  const r = await checkins.checkInReviewQueue(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
checkInRouter.get('/missed', requireKind('STAFF'), validate({ query: paginationQuery }), async (req: Request, res: Response) => {
  const r = await checkins.missedCheckInQueue(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
checkInRouter.get('/:id', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, { checkIn: await checkins.getCheckIn(principalOf(req), id(req)) }));
checkInRouter.post('/:id/review', requireKind('STAFF'), validate({ params: idParams, body: reviewSchema }), async (req: Request, res: Response) =>
  ok(res, { checkIn: await checkins.reviewCheckIn(principalOf(req), id(req), notes(req)) }),
);

export const checkInTemplateRouter = Router();
checkInTemplateRouter.use(authenticate());
checkInTemplateRouter.get('/', validate({ query: z.object({ includeDrafts: z.coerce.boolean().optional() }) }), async (req: Request, res: Response) =>
  ok(res, { templates: await checkins.listTemplates(principalOf(req), validated<{ includeDrafts?: boolean }>(req, 'query').includeDrafts) }),
);
checkInTemplateRouter.get('/:id', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, { template: await checkins.getTemplate(principalOf(req), id(req)) }));
checkInTemplateRouter.post('/', requirePermission('checkins.templates.manage'), validate({ body: createCheckInTemplateSchema }), async (req: Request, res: Response) =>
  created(res, { template: await checkins.createTemplate(principalOf(req), validated(req, 'body')) }),
);
checkInTemplateRouter.put('/:id', requirePermission('checkins.templates.manage'), validate({ params: idParams, body: createCheckInTemplateSchema }), async (req: Request, res: Response) =>
  ok(res, { template: await checkins.reviseTemplate(principalOf(req), id(req), validated(req, 'body')) }),
);
checkInTemplateRouter.post('/:id/approve', requirePermission('alerts.rules.approve'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { template: await checkins.approveTemplate(principalOf(req), id(req)) }),
);

/* ------------------------------- Symptoms ------------------------------- */
export const symptomRouter = Router();
symptomRouter.use(authenticate());
symptomRouter.post('/', requirePermission('checkins.create'), validate({ body: submitSymptomSchema }), async (req: Request, res: Response) => {
  const r = await checkins.submitSymptom(principalOf(req), validated(req, 'body'));
  ok(res, r, r.duplicate ? 200 : 201);
});
symptomRouter.get(
  '/',
  validate({ query: z.object({ episodeId: objectId.optional(), pending: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  async (req: Request, res: Response) => {
    const r = await checkins.listSymptoms(principalOf(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
);
symptomRouter.get('/:id', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, { symptom: await checkins.getSymptom(principalOf(req), id(req)) }));
symptomRouter.post('/:id/review', requireKind('STAFF'), validate({ params: idParams, body: reviewSchema }), async (req: Request, res: Response) =>
  ok(res, { symptom: await checkins.reviewSymptom(principalOf(req), id(req), notes(req)) }),
);

/* ---------------------------- Medication events ---------------------------- */
export const medicationRouter = Router();
medicationRouter.use(authenticate());
medicationRouter.post('/medication-events', validate({ body: medicationEventSchema }), async (req: Request, res: Response) => {
  const r = await meds.reportMedicationEvent(principalOf(req), validated(req, 'body'));
  ok(res, r, r.duplicate ? 200 : 201);
});
medicationRouter.get('/medication-concerns', requirePermission('medication.review'), validate({ query: paginationQuery }), async (req: Request, res: Response) => {
  const r = await meds.listMedicationConcerns(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
medicationRouter.post('/medication-events/:id/review', requirePermission('medication.review'), validate({ params: idParams, body: reviewSchema }), async (req: Request, res: Response) =>
  ok(res, { event: await meds.reviewMedicationEvent(principalOf(req), id(req), notes(req)) }),
);
medicationRouter.post(
  '/medication-orders/:id/discontinue',
  requirePermission('medication.manage'),
  validate({ params: idParams, body: z.object({ reason: z.string().trim().min(3).max(1000) }) }),
  async (req: Request, res: Response) => ok(res, { order: await meds.discontinueOrder(principalOf(req), id(req), validated<{ reason: string }>(req, 'body').reason) }),
);

/* -------------------------------- Alerts -------------------------------- */
export const alertRouter = Router();
alertRouter.use(authenticate(), requireKind('STAFF'));
alertRouter.get('/', requirePermission('alerts.read'), validate({ query: alertListQuery }), async (req: Request, res: Response) => {
  const r = await alerts.listAlerts(principalOf(req), validated(req, 'query'));
  paginated(res, r.items, r.meta);
});
alertRouter.post('/', requirePermission('alerts.acknowledge'), validate({ body: createManualAlertSchema }), async (req: Request, res: Response) =>
  created(res, { alert: await alerts.createManualAlert(principalOf(req), validated(req, 'body')) }),
);
alertRouter.get('/rules', validate({ query: z.object({ status: z.enum(ALERT_RULE_STATUSES).optional() }) }), async (req: Request, res: Response) =>
  ok(res, { rules: await alerts.listRules(principalOf(req), validated<{ status?: string }>(req, 'query').status) }),
);
alertRouter.post('/rules', requirePermission('alerts.rules.manage'), validate({ body: createAlertRuleSchema }), async (req: Request, res: Response) =>
  created(res, { rule: await alerts.createRule(principalOf(req), validated(req, 'body')) }),
);
alertRouter.put('/rules/:id', requirePermission('alerts.rules.manage'), validate({ params: idParams, body: createAlertRuleSchema }), async (req: Request, res: Response) =>
  ok(res, { rule: await alerts.updateRule(principalOf(req), id(req), validated(req, 'body')) }),
);
alertRouter.post('/rules/:id/submit', requirePermission('alerts.rules.manage'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { rule: await alerts.submitRule(principalOf(req), id(req)) }),
);
alertRouter.post('/rules/:id/approve', requirePermission('alerts.rules.approve'), validate({ params: idParams, body: z.object({ comment: z.string().max(1000).optional() }) }), async (req: Request, res: Response) =>
  ok(res, { rule: await alerts.approveRule(principalOf(req), id(req), validated<{ comment?: string }>(req, 'body').comment) }),
);
alertRouter.post('/rules/:id/retire', validate({ params: idParams }), async (req: Request, res: Response) => ok(res, { rule: await alerts.retireRule(principalOf(req), id(req)) }));
alertRouter.get('/:id', requirePermission('alerts.read'), validate({ params: idParams }), async (req: Request, res: Response) => ok(res, await alerts.getAlert(principalOf(req), id(req))));
alertRouter.post('/:id/acknowledge', requirePermission('alerts.acknowledge'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { alert: await alerts.acknowledgeAlert(principalOf(req), id(req)) }),
);
alertRouter.post('/:id/assign', requirePermission('alerts.assign'), validate({ params: idParams, body: assignAlertSchema }), async (req: Request, res: Response) =>
  ok(res, { alert: await alerts.assignAlert(principalOf(req), id(req), validated(req, 'body')) }),
);
alertRouter.post('/:id/actions', requirePermission('alerts.acknowledge'), validate({ params: idParams, body: alertActionSchema }), async (req: Request, res: Response) =>
  created(res, { action: await alerts.addAlertAction(principalOf(req), id(req), validated(req, 'body')) }),
);
alertRouter.post('/:id/resolve', requirePermission('alerts.resolve'), validate({ params: idParams, body: resolveAlertSchema }), async (req: Request, res: Response) =>
  ok(res, { alert: await alerts.resolveAlert(principalOf(req), id(req), validated(req, 'body')) }),
);
alertRouter.post('/:id/close', requirePermission('alerts.resolve'), validate({ params: idParams }), async (req: Request, res: Response) =>
  ok(res, { alert: await alerts.closeAlert(principalOf(req), id(req)) }),
);
