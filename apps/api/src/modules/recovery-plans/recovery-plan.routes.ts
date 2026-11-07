import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { completeTaskSchema, objectId } from '@recoveros/shared';
import { authenticate, principalOf, requireKind, requirePermission } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { ok, validated } from '../../utils/http';
import * as tasks from './task.service';

const id = (req: Request) => validated<{ id: string }>(req, 'params').id;

export const recoveryPlanRouter = Router();
recoveryPlanRouter.use(authenticate());
recoveryPlanRouter.get('/:id', validate({ params: idParams }), async (req: Request, res: Response) => {
  ok(res, { plan: await tasks.getRecoveryPlan(principalOf(req), id(req)) });
});

export const taskRouter = Router();
taskRouter.use(authenticate());
/** Today's tasks across the patient's/caregiver's active episodes. */
taskRouter.get('/today', requireKind('PATIENT', 'CAREGIVER'), async (req: Request, res: Response) => {
  ok(res, { tasks: await tasks.todayTasks(principalOf(req)) });
});
taskRouter.post('/:id/complete', validate({ params: idParams, body: completeTaskSchema }), async (req: Request, res: Response) => {
  ok(res, { task: await tasks.completeTask(principalOf(req), id(req), validated(req, 'body')) });
});
taskRouter.post(
  '/:id/assign',
  requirePermission('recovery.update'),
  validate({ params: idParams, body: z.object({ userId: objectId }) }),
  async (req: Request, res: Response) => {
    ok(res, { task: await tasks.assignTask(principalOf(req), id(req), validated<{ userId: string }>(req, 'body').userId) });
  },
);
