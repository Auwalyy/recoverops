import { Types } from 'mongoose';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeScopedFilter, loadEpisode } from '../access/access.service';
import { RecoveryAssignmentModel, UserRoleModel } from '../access/access.models';
import { RehabilitationPlanModel, RehabilitationSessionModel, type RehabilitationPlanDocument } from './rehabilitation.models';

async function loadPlan(p: Principal, planId: string, permission: 'rehabilitation.read' | 'rehabilitation.manage'): Promise<RehabilitationPlanDocument> {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(planId)) throw errors.notFound('Rehabilitation plan');
  const plan = await RehabilitationPlanModel.findOne({ _id: planId, hospitalId });
  if (!plan) throw errors.notFound('Rehabilitation plan');
  await loadEpisode(p, plan.episodeId as Types.ObjectId, permission);
  return plan;
}

/**
 * Exercises are authored by the physiotherapist (clinician) — RecoverOS never
 * generates exercises. Creating a plan adds the physiotherapist to the care team.
 */
export async function createPlan(
  p: Principal,
  input: { episodeId: string; physiotherapistId: string; goals: string[]; exercises: unknown[]; milestones: Array<{ title: string; targetDate?: string }>; startDate: string; endDate?: string },
) {
  assertPermission(p, 'rehabilitation.manage');
  const episode = await loadEpisode(p, input.episodeId, 'rehabilitation.read');
  const hospitalId = requireTenant(p);
  const physio = await UserRoleModel.findOne({ hospitalId, userId: input.physiotherapistId, status: 'ACTIVE', roles: 'PHYSIOTHERAPIST' });
  if (!physio) throw errors.validation('Select an active physiotherapist of this hospital');
  const plan = await RehabilitationPlanModel.create({ ...input, hospitalId, episodeId: episode._id, patientId: episode.patientId, status: 'ACTIVE', createdBy: p.userId });
  await RecoveryAssignmentModel.updateOne(
    { hospitalId, episodeId: episode._id, userId: input.physiotherapistId, role: 'PHYSIOTHERAPIST', active: true },
    { $setOnInsert: { hospitalId, episodeId: episode._id, patientId: episode.patientId, userId: input.physiotherapistId, role: 'PHYSIOTHERAPIST', active: true, assignedBy: p.userId } },
    { upsert: true },
  );
  await audit({ action: 'REHAB_PLAN_CREATED', resourceType: 'RehabilitationPlan', resourceId: String(plan._id), patientId: String(episode.patientId) });
  return plan;
}

export async function listPlans(p: Principal, q: { episodeId?: string; mine?: boolean }) {
  let filter: Record<string, unknown>;
  if (q.episodeId) {
    const ep = await loadEpisode(p, q.episodeId, 'rehabilitation.read');
    filter = { hospitalId: requireTenant(p), episodeId: ep._id };
  } else filter = await episodeScopedFilter(p, 'rehabilitation.read');
  if (q.mine && p.kind === 'STAFF') filter.physiotherapistId = new Types.ObjectId(p.userId);
  return RehabilitationPlanModel.find(filter)
    .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
    .populate('physiotherapistId', 'firstName lastName')
    .sort({ createdAt: -1 });
}

export async function getPlan(p: Principal, planId: string) {
  const plan = await loadPlan(p, planId, 'rehabilitation.read');
  await plan.populate('physiotherapistId', 'firstName lastName');
  const sessions = await RehabilitationSessionModel.find({ hospitalId: plan.hospitalId, planId: plan._id }).sort({ scheduledAt: 1 });
  const attended = sessions.filter((s) => s.status === 'ATTENDED').length;
  const due = sessions.filter((s) => s.status !== 'SCHEDULED' && s.status !== 'CANCELLED').length;
  return { plan, sessions, attendanceRate: due ? attended / due : null };
}

export async function updatePlan(p: Principal, planId: string, input: { exercises?: unknown[]; goals?: string[]; status?: string; reviewNote?: string; endDate?: string }) {
  assertPermission(p, 'rehabilitation.manage');
  const plan = await loadPlan(p, planId, 'rehabilitation.manage');
  const { reviewNote, ...rest } = input;
  plan.set(rest);
  if (reviewNote) plan.reviewNotes.push({ note: reviewNote, authorId: new Types.ObjectId(p.userId), at: new Date() });
  await plan.save();
  await audit({ action: 'REHAB_PLAN_UPDATED', resourceType: 'RehabilitationPlan', resourceId: planId, patientId: String(plan.patientId), metadata: { fields: Object.keys(input) } });
  return plan;
}

export async function achieveMilestone(p: Principal, planId: string, milestoneId: string, notes?: string) {
  assertPermission(p, 'rehabilitation.manage');
  const plan = await loadPlan(p, planId, 'rehabilitation.manage');
  const m = plan.milestones.id(milestoneId);
  if (!m) throw errors.notFound('Milestone');
  m.achievedAt = new Date();
  m.approvedBy = new Types.ObjectId(p.userId);
  m.notes = notes;
  await plan.save();
  await audit({ action: 'REHAB_MILESTONE_ACHIEVED', resourceType: 'RehabilitationPlan', resourceId: planId, patientId: String(plan.patientId) });
  return plan;
}

export async function scheduleSession(p: Principal, input: { planId: string; scheduledAt: string; durationMinutes: number; location?: string; mode: string }) {
  assertPermission(p, 'rehabilitation.manage');
  const plan = await loadPlan(p, input.planId, 'rehabilitation.manage');
  const session = await RehabilitationSessionModel.create({
    ...input,
    scheduledAt: new Date(input.scheduledAt),
    hospitalId: plan.hospitalId,
    planId: plan._id,
    episodeId: plan.episodeId,
    patientId: plan.patientId,
    physiotherapistId: plan.physiotherapistId,
  });
  await audit({ action: 'REHAB_SESSION_SCHEDULED', resourceType: 'RehabilitationSession', resourceId: String(session._id), patientId: String(plan.patientId) });
  return session;
}

export async function listSessions(p: Principal, q: { from?: string; to?: string; mine?: boolean; page: number; limit: number }) {
  const filter: Record<string, unknown> = await episodeScopedFilter(p, 'rehabilitation.read');
  const when: Record<string, Date> = {};
  if (q.from) when.$gte = new Date(q.from);
  if (q.to) when.$lt = new Date(q.to);
  if (Object.keys(when).length) filter.scheduledAt = when;
  if (q.mine && p.kind === 'STAFF') filter.physiotherapistId = new Types.ObjectId(p.userId);
  const [items, total] = await Promise.all([
    RehabilitationSessionModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .sort({ scheduledAt: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    RehabilitationSessionModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function recordSession(p: Principal, sessionId: string, input: { status: 'ATTENDED' | 'MISSED' | 'CANCELLED'; progressNotes?: string; assessment?: Record<string, unknown> }) {
  assertPermission(p, 'rehabilitation.manage');
  const hospitalId = requireTenant(p);
  const s = await RehabilitationSessionModel.findOne({ _id: sessionId, hospitalId });
  if (!s) throw errors.notFound('Session');
  await loadEpisode(p, s.episodeId as Types.ObjectId, 'rehabilitation.manage');
  s.set({ ...input, recordedBy: p.userId, recordedAt: new Date() });
  await s.save();
  await audit({ action: 'REHAB_SESSION_RECORDED', resourceType: 'RehabilitationSession', resourceId: sessionId, patientId: String(s.patientId), metadata: { status: input.status } });
  return s;
}

/** Patient-reported exercise difficulty (reported, not assessed). Idempotent. */
export async function reportDifficulty(p: Principal, sessionId: string, input: { difficulty: number; notes?: string; idempotencyKey: string }) {
  if (p.kind !== 'PATIENT' && p.kind !== 'CAREGIVER') throw errors.forbidden();
  const hospitalId = requireTenant(p);
  const s = await RehabilitationSessionModel.findOne({ _id: sessionId, hospitalId });
  if (!s) throw errors.notFound('Session');
  await loadEpisode(p, s.episodeId as Types.ObjectId, 'rehabilitation.read');
  if (s.patientReports.some((r) => r.idempotencyKey === input.idempotencyKey)) return s;
  s.patientReports.push({ ...input, reportedBy: new Types.ObjectId(p.userId), at: new Date() });
  await s.save();
  return s;
}
