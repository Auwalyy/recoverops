import { Router } from 'express';
import { z } from 'zod';
import {
  ROLES,
  breakGlassSchema,
  createDepartmentSchema,
  inviteStaffSchema,
  objectId,
  registerHospitalSchema,
  updateHospitalSchema,
  updateStaffSchema,
} from '@recoveros/shared';
import { authenticate, requireKind, requirePermission } from '../../middleware/auth';
import { idParams, validate } from '../../middleware/validate';
import { authRateLimit } from '../../middleware/rate-limit';
import { hospitalController as c } from './hospital.controller';

export const hospitalRouter = Router();

hospitalRouter.post('/register', authRateLimit, validate({ body: registerHospitalSchema }), c.register);

hospitalRouter.use(authenticate());
hospitalRouter.get('/me', requireKind('STAFF'), c.me);
hospitalRouter.get('/me/public', c.publicInfo);
hospitalRouter.patch('/me', requirePermission('hospital.settings.manage'), validate({ body: updateHospitalSchema }), c.update);
hospitalRouter.get('/me/subscription', requirePermission('billing.manage'), c.subscription);

hospitalRouter.get('/departments', requireKind('STAFF'), c.listDepartments);
hospitalRouter.post('/departments', requirePermission('hospital.settings.manage'), validate({ body: createDepartmentSchema }), c.createDepartment);
hospitalRouter.patch(
  '/departments/:id',
  requirePermission('hospital.settings.manage'),
  validate({ params: idParams, body: z.object({ name: z.string().min(1).max(200).optional(), description: z.string().max(500).optional(), active: z.boolean().optional() }) }),
  c.updateDepartment,
);

hospitalRouter.get(
  '/staff',
  requireKind('STAFF'),
  validate({ query: z.object({ role: z.enum(ROLES).optional(), departmentId: objectId.optional() }) }),
  c.listStaff,
);
hospitalRouter.post('/staff/invitations', requirePermission('users.manage'), validate({ body: inviteStaffSchema }), c.inviteStaff);
hospitalRouter.patch('/staff/:id', requirePermission('users.manage'), validate({ params: idParams, body: updateStaffSchema }), c.updateStaff);
hospitalRouter.post(
  '/staff/:id/status',
  requirePermission('users.manage'),
  validate({ params: idParams, body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']), reason: z.string().max(500).optional() }) }),
  c.setStaffStatus,
);
hospitalRouter.post('/break-glass', requireKind('STAFF'), validate({ body: breakGlassSchema }), c.breakGlass);

/** RecoverOS operator endpoints. No clinical data is reachable from here. */
export const platformRouter = Router();
platformRouter.use(authenticate(), requireKind('PLATFORM'));
platformRouter.get(
  '/hospitals',
  requirePermission('platform.hospitals.manage'),
  validate({ query: z.object({ status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional() }) }),
  c.platformList,
);
platformRouter.post(
  '/hospitals/:id/verification',
  requirePermission('platform.hospitals.manage'),
  validate({ params: idParams, body: z.object({ status: z.enum(['VERIFIED', 'REJECTED', 'SUSPENDED']), notes: z.string().max(1000).optional() }) }),
  c.platformVerify,
);
platformRouter.post(
  '/hospitals/:id/subscription/plan',
  requirePermission('platform.subscriptions.manage'),
  validate({ params: idParams, body: z.object({ planCode: z.string().min(2).max(40) }) }),
  c.platformChangePlan,
);
platformRouter.post('/hospitals/:id/invoices', requirePermission('platform.subscriptions.manage'), validate({ params: idParams }), c.platformIssueInvoice);
platformRouter.post(
  '/hospitals/:id/invoices/:invoiceId/mark-paid',
  requirePermission('platform.subscriptions.manage'),
  validate({ params: z.object({ id: objectId, invoiceId: objectId }), body: z.object({ providerRef: z.string().max(200).optional() }) }),
  c.platformMarkPaid,
);
