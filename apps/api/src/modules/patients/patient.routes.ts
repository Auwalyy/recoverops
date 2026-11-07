import { Router, type Request, type Response } from 'express';
import { createPatientSchema, patientSearchQuery, updatePatientSchema } from '@recoveros/shared';
import { authenticate, principalOf, requireKind, requirePermission } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { created, ok, paginated, validated } from '../../utils/http';
import * as svc from './patient.service';

/** Patient controller handlers (thin: validate → service → respond). */
const c = {
  create: async (req: Request, res: Response) => created(res, await svc.createPatient(principalOf(req), validated(req, 'body'))),
  list: async (req: Request, res: Response) => {
    const r = await svc.listPatients(principalOf(req), validated(req, 'query'));
    paginated(res, r.items, r.meta);
  },
  me: async (req: Request, res: Response) => ok(res, { patients: await svc.getMyPatientProfiles(principalOf(req)) }),
  get: async (req: Request, res: Response) => ok(res, await svc.getPatient(principalOf(req), validated<{ id: string }>(req, 'params').id)),
  update: async (req: Request, res: Response) =>
    ok(res, { patient: await svc.updatePatient(principalOf(req), validated<{ id: string }>(req, 'params').id, validated(req, 'body')) }),
  invite: async (req: Request, res: Response) => created(res, await svc.invitePatientAccount(principalOf(req), validated<{ id: string }>(req, 'params').id)),
  careTeam: async (req: Request, res: Response) => ok(res, { careTeam: await svc.getCareTeam(principalOf(req), validated<{ id: string }>(req, 'params').id) }),
};

export const patientRouter = Router();
patientRouter.use(authenticate());
patientRouter.get('/me', requireKind('PATIENT'), c.me);
patientRouter.get('/', requireKind('STAFF'), requirePermission('patients.read'), validate({ query: patientSearchQuery }), c.list);
patientRouter.post('/', requirePermission('patients.create'), validate({ body: createPatientSchema }), c.create);
patientRouter.get('/:id', validate({ params: idParams }), c.get);
patientRouter.patch('/:id', requirePermission('patients.update'), validate({ params: idParams, body: updatePatientSchema }), c.update);
patientRouter.post('/:id/invitation', requirePermission('patients.update'), validate({ params: idParams }), c.invite);
patientRouter.get('/:id/care-team', requireKind('STAFF'), validate({ params: idParams }), c.careTeam);
