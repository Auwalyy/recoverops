import type { Request, Response } from 'express';
import type { RegisterHospitalInput, RoleCode } from '@recoveros/shared';
import { principalOf } from '../../middleware/auth';
import { created, ok, validated } from '../../utils/http';
import * as svc from './hospital.service';
import * as billing from '../billing/billing.service';
import { requireTenant } from '../access/principal';
import { InvoiceModel } from '../billing/billing.models';
import { Types } from 'mongoose';

export const hospitalController = {
  async register(req: Request, res: Response) {
    const result = await svc.registerHospital(validated<RegisterHospitalInput>(req, 'body'));
    created(res, { hospital: result.hospital, message: 'Hospital registered. Sign in as the administrator; patient onboarding unlocks after verification.' });
  },
  async me(req: Request, res: Response) {
    ok(res, { hospital: await svc.getHospital(principalOf(req)) });
  },
  async publicInfo(req: Request, res: Response) {
    ok(res, { hospital: await svc.getHospitalPublicInfo(principalOf(req)) });
  },
  async update(req: Request, res: Response) {
    ok(res, { hospital: await svc.updateHospital(principalOf(req), validated(req, 'body')) });
  },
  async listDepartments(req: Request, res: Response) {
    ok(res, { departments: await svc.listDepartments(principalOf(req)) });
  },
  async createDepartment(req: Request, res: Response) {
    created(res, { department: await svc.createDepartment(principalOf(req), validated(req, 'body')) });
  },
  async updateDepartment(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    ok(res, { department: await svc.updateDepartment(principalOf(req), id, validated(req, 'body')) });
  },
  async listStaff(req: Request, res: Response) {
    ok(res, { staff: await svc.listStaff(principalOf(req), validated(req, 'query')) });
  },
  async inviteStaff(req: Request, res: Response) {
    created(res, await svc.inviteStaff(principalOf(req), validated(req, 'body')));
  },
  async updateStaff(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    ok(res, { membership: await svc.updateStaff(principalOf(req), id, validated<{ roles?: RoleCode[] }>(req, 'body')) });
  },
  async setStaffStatus(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    const { status, reason } = validated<{ status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'; reason?: string }>(req, 'body');
    ok(res, { membership: await svc.setStaffStatus(principalOf(req), id, status, reason) });
  },
  async breakGlass(req: Request, res: Response) {
    created(res, { grant: await svc.breakGlass(principalOf(req), validated(req, 'body')) });
  },
  async subscription(req: Request, res: Response) {
    const p = principalOf(req);
    const hospitalId = requireTenant(p);
    const [ent, usage, invoices] = await Promise.all([
      billing.getEntitlements(hospitalId),
      billing.getUsage(hospitalId),
      InvoiceModel.find({ hospitalId }).sort({ createdAt: -1 }).limit(24),
    ]);
    ok(res, { status: ent.status, plan: ent.plan, subscription: ent.subscription, features: ent.features, usage, invoices });
  },
  async platformList(req: Request, res: Response) {
    ok(res, { hospitals: await svc.platformListHospitals(validated(req, 'query')) });
  },
  async platformVerify(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    const { status, notes } = validated<{ status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED'; notes?: string }>(req, 'body');
    ok(res, { hospital: await svc.platformSetVerification(principalOf(req).userId, id, status, notes) });
  },
  async platformChangePlan(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    const { planCode } = validated<{ planCode: string }>(req, 'body');
    ok(res, { subscription: await billing.changePlan(new Types.ObjectId(id), planCode, principalOf(req).userId) });
  },
  async platformIssueInvoice(req: Request, res: Response) {
    const { id } = validated<{ id: string }>(req, 'params');
    created(res, { invoice: await billing.issueInvoice(new Types.ObjectId(id)) });
  },
  async platformMarkPaid(req: Request, res: Response) {
    const { id, invoiceId } = validated<{ id: string; invoiceId: string }>(req, 'params');
    const { providerRef } = validated<{ providerRef?: string }>(req, 'body');
    ok(res, { invoice: await billing.markInvoicePaid(new Types.ObjectId(id), invoiceId, providerRef, principalOf(req).userId) });
  },
};
