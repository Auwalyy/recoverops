import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  EPISODE_STATUSES,
  assignCareTeamSchema,
  createEpisodeSchema,
  episodeTransitionSchema,
  objectId,
  paginationQuery,
  taskListQuery,
  updateEpisodeSchema,
} from '@recoveros/shared';
import { authenticate, principalOf, requirePermission } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { created, ok, paginated, validated } from '../../utils/http';
import * as svc from './episode.service';
import * as tasks from '../recovery-plans/task.service';
import * as meds from '../medications/medication.service';
import * as checkins from '../checkins/checkin.service';
import * as discharge from '../discharge/discharge.service';

const id = (req: Request) => validated<{ id: string }>(req, 'params').id;

const c = {
  create: async (req: Request, res: Response) => created(res, { episode: await svc.createEpisode(principalOf(req), validated(req, 'body')) }),
  list: async (req: Request, res: Response) => {
    const r = await svc.listEpisodes(principalOf(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
  get: async (req: Request, res: Response) => ok(res, await svc.getEpisodeDetail(principalOf(req), id(req))),
  update: async (req: Request, res: Response) => ok(res, { episode: await svc.updateEpisode(principalOf(req), id(req), validated(req, 'body')) }),
  transition: async (req: Request, res: Response) => ok(res, { episode: await svc.transitionEpisode(principalOf(req), id(req), validated(req, 'body')) }),
  assign: async (req: Request, res: Response) => created(res, { assignment: await svc.assignCareTeam(principalOf(req), id(req), validated(req, 'body')) }),
  unassign: async (req: Request, res: Response) => {
    const params = validated<{ id: string; assignmentId: string }>(req, 'params');
    ok(res, { assignment: await svc.removeCareTeamMember(principalOf(req), params.id, params.assignmentId) });
  },
  tasks: async (req: Request, res: Response) => {
    const r = await tasks.listEpisodeTasks(principalOf(req), id(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
  today: async (req: Request, res: Response) => ok(res, { tasks: await tasks.todayTasks(principalOf(req), id(req)) }),
  medications: async (req: Request, res: Response) =>
    ok(res, { medications: await meds.listEpisodeMedications(principalOf(req), id(req), validated<{ includeInactive?: boolean }>(req, 'query').includeInactive) }),
  medicationEvents: async (req: Request, res: Response) => {
    const r = await meds.listMedicationEvents(principalOf(req), id(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
  checkIns: async (req: Request, res: Response) => {
    const r = await checkins.listEpisodeCheckIns(principalOf(req), id(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
  dischargePlan: async (req: Request, res: Response) => ok(res, await discharge.getDischargePlanForEpisode(principalOf(req), id(req))),
};

export const episodeRouter = Router();
episodeRouter.use(authenticate());
episodeRouter.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(EPISODE_STATUSES).optional(),
      patientId: objectId.optional(),
      departmentId: objectId.optional(),
      mine: z.coerce.boolean().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  c.list,
);
episodeRouter.post('/', requirePermission('recovery.create'), validate({ body: createEpisodeSchema }), c.create);
episodeRouter.get('/:id', validate({ params: idParams }), c.get);
episodeRouter.patch('/:id', requirePermission('recovery.update'), validate({ params: idParams, body: updateEpisodeSchema }), c.update);
episodeRouter.post('/:id/transitions', requirePermission('recovery.update'), validate({ params: idParams, body: episodeTransitionSchema }), c.transition);
episodeRouter.post('/:id/care-team', requirePermission('patients.assign'), validate({ params: idParams, body: assignCareTeamSchema }), c.assign);
episodeRouter.delete('/:id/care-team/:assignmentId', requirePermission('patients.assign'), validate({ params: z.object({ id: objectId, assignmentId: objectId }) }), c.unassign);
episodeRouter.get('/:id/tasks', validate({ params: idParams, query: taskListQuery }), c.tasks);
episodeRouter.get('/:id/tasks/today', validate({ params: idParams }), c.today);
episodeRouter.get('/:id/medications', validate({ params: idParams, query: z.object({ includeInactive: z.coerce.boolean().optional() }) }), c.medications);
episodeRouter.get('/:id/medication-events', validate({ params: idParams, query: paginationQuery }), c.medicationEvents);
episodeRouter.get('/:id/check-ins', validate({ params: idParams, query: paginationQuery }), c.checkIns);
episodeRouter.get('/:id/discharge-plan', validate({ params: idParams }), c.dischargePlan);
