import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  approveDischargePlanSchema,
  createDischargePlanSchema,
  dischargeContentSchema,
  recordUnderstandingSchema,
  submitDischargePlanSchema,
  updateDischargePlanSchema,
} from '@recoveros/shared';
import { authenticate, principalOf, requireKind, requirePermission } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { created, ok, validated } from '../../utils/http';
import * as svc from './discharge.service';

const id = (req: Request) => validated<{ id: string }>(req, 'params').id;

const c = {
  create: async (req: Request, res: Response) => created(res, await svc.createDischargePlan(principalOf(req), validated(req, 'body'))),
  pending: async (req: Request, res: Response) => ok(res, { plans: await svc.listPendingApprovals(principalOf(req)) }),
  get: async (req: Request, res: Response) => ok(res, await svc.getDischargePlan(principalOf(req), id(req))),
  update: async (req: Request, res: Response) => ok(res, { version: await svc.updateDraft(principalOf(req), id(req), validated<{ content: unknown }>(req, 'body').content) }),
  submit: async (req: Request, res: Response) => ok(res, await svc.submitPlan(principalOf(req), id(req), validated<{ comment?: string }>(req, 'body').comment)),
  approve: async (req: Request, res: Response) => {
    const r = await svc.decidePlan(principalOf(req), id(req), validated(req, 'body'));
    ok(res, { plan: r.plan, version: r.version, episode: r.episode, activated: r.activated });
  },
  amend: async (req: Request, res: Response) => created(res, { version: await svc.amendPlan(principalOf(req), id(req), validated(req, 'body')) }),
  understanding: async (req: Request, res: Response) => ok(res, { version: await svc.recordUnderstanding(principalOf(req), id(req), validated(req, 'body')) }),
};

export const dischargeRouter = Router();
dischargeRouter.use(authenticate());
dischargeRouter.post('/', requirePermission('discharge.create'), validate({ body: createDischargePlanSchema }), c.create);
dischargeRouter.get('/pending-approval', requirePermission('discharge.approve'), c.pending);
dischargeRouter.get('/:id', validate({ params: idParams }), c.get);
dischargeRouter.patch('/:id', requireKind('STAFF'), requirePermission('discharge.create'), validate({ params: idParams, body: updateDischargePlanSchema }), c.update);
dischargeRouter.post('/:id/submit', requirePermission('discharge.create'), validate({ params: idParams, body: submitDischargePlanSchema }), c.submit);
dischargeRouter.post('/:id/approve', requirePermission('discharge.approve'), validate({ params: idParams, body: approveDischargePlanSchema }), c.approve);
dischargeRouter.post(
  '/:id/amendments',
  requirePermission('discharge.create'),
  validate({ params: idParams, body: z.object({ content: dischargeContentSchema, reason: z.string().trim().min(3).max(1000) }) }),
  c.amend,
);
dischargeRouter.post('/:id/patient-understanding', requirePermission('discharge.review'), validate({ params: idParams, body: recordUnderstandingSchema }), c.understanding);
