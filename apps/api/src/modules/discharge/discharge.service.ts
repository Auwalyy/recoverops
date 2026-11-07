import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import { dischargeContentSchema, type DischargeContent } from '@recoveros/shared';
import { withTransaction } from '../../database/connection';
import { errors } from '../../utils/errors';
import { sha256 } from '../../utils/crypto';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, loadEpisode } from '../access/access.service';
import { CheckInTemplateModel } from '../checkins/checkin.models';
import { HospitalModel } from '../hospitals/hospital.models';
import { PatientModel } from '../patients/patient.model';
import { UserRoleModel } from '../access/access.models';
import { MedicationOrderModel, MedicationScheduleModel, type MedicationOrderDocument } from '../medications/medication.models';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { applyTransition } from '../recovery-episodes/episode.service';
import { generatePlanFromVersion } from '../recovery-plans/recovery-plan.service';
import { addDays, planEndDate } from '../recovery-plans/engine';
import { notify } from '../notifications/notification.service';
import { DischargePlanModel, DischargePlanVersionModel, PlanApprovalModel, type DischargePlanDocument } from './discharge.models';

function hashContent(content: DischargeContent): string {
  return sha256(JSON.stringify(content));
}

/** Validate references inside clinical content belong to this hospital. */
async function validateContentRefs(hospitalId: Types.ObjectId, raw: unknown): Promise<DischargeContent> {
  const content = dischargeContentSchema.parse(raw);
  if (content.checkInTemplateId) {
    const ok = await CheckInTemplateModel.exists({ _id: content.checkInTemplateId, hospitalId, status: 'ACTIVE' });
    if (!ok) throw errors.validation('Check-in template must be an approved (active) template of this hospital');
  }
  const clinicianIds = content.followUps.map((f) => f.clinicianId).filter(Boolean) as string[];
  if (clinicianIds.length) {
    const count = await UserRoleModel.countDocuments({ hospitalId, userId: { $in: clinicianIds }, status: 'ACTIVE' });
    if (count !== new Set(clinicianIds).size) throw errors.validation('Follow-up clinicians must be staff of this hospital');
  }
  return content;
}

async function loadPlan(p: Principal, planId: string, permission: Parameters<typeof loadEpisode>[2]): Promise<{ plan: DischargePlanDocument }> {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(planId)) throw errors.notFound('Discharge plan');
  const plan = await DischargePlanModel.findOne({ _id: planId, hospitalId });
  if (!plan) throw errors.notFound('Discharge plan');
  await loadEpisode(p, plan.episodeId as Types.ObjectId, permission);
  return { plan };
}

export async function createDischargePlan(p: Principal, input: { episodeId: string; content: unknown }) {
  assertPermission(p, 'discharge.create');
  const episode = await loadEpisode(p, input.episodeId, 'recovery.read');
  const hospitalId = requireTenant(p);
  if (episode.status !== 'DRAFT') throw errors.validation('Discharge plans can only be created for draft episodes; amend the existing plan instead');
  if (await DischargePlanModel.exists({ hospitalId, episodeId: episode._id })) throw errors.conflict('This episode already has a discharge plan');
  const content = await validateContentRefs(hospitalId, input.content);

  return withTransaction(async (session) => {
    const [plan] = await DischargePlanModel.create([{ hospitalId, episodeId: episode._id, patientId: episode.patientId, status: 'DRAFT', createdBy: p.userId }], { session });
    const [version] = await DischargePlanVersionModel.create(
      [{ hospitalId, planId: plan!._id, episodeId: episode._id, patientId: episode.patientId, versionNumber: 1, status: 'DRAFT', content, contentHash: hashContent(content), authoredBy: p.userId }],
      { session },
    );
    plan!.currentVersionId = version!._id;
    await plan!.save({ session });
    await RecoveryEpisodeModel.updateOne({ _id: episode._id, hospitalId }, { $set: { currentDischargePlanId: plan!._id } }, { session });
    await audit({ action: 'DISCHARGE_PLAN_CREATED', resourceType: 'DischargePlan', resourceId: String(plan!._id), patientId: String(episode.patientId) }, session);
    return { plan: plan!, version: version! };
  });
}

/**
 * Staff see the working draft and version history; patients/caregivers see ONLY the
 * approved version (never unapproved clinical instructions).
 */
export async function getDischargePlan(p: Principal, planId: string) {
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);
  if (p.kind !== 'STAFF') {
    if (!plan.approvedVersionId) throw errors.notFound('Approved discharge plan');
    const approved = await DischargePlanVersionModel.findOne({ hospitalId, _id: plan.approvedVersionId }).select('versionNumber content approvedAt');
    return { plan: { id: String(plan._id), episodeId: String(plan.episodeId), status: 'APPROVED' }, approvedVersion: approved };
  }
  const versions = await DischargePlanVersionModel.find({ hospitalId, planId: plan._id })
    .sort({ versionNumber: -1 })
    .populate('authoredBy approvedBy submittedBy', 'firstName lastName');
  const approvals = await PlanApprovalModel.find({ hospitalId, planId: plan._id }).sort({ createdAt: -1 }).populate('decidedBy', 'firstName lastName');
  return {
    plan,
    currentVersion: versions.find((v) => String(v._id) === String(plan.currentVersionId)),
    approvedVersion: versions.find((v) => String(v._id) === String(plan.approvedVersionId)),
    versions: versions.map((v) => ({ id: String(v._id), versionNumber: v.versionNumber, status: v.status, createdAt: v.get('createdAt'), approvedAt: v.approvedAt })),
    approvals,
  };
}

export async function getDischargePlanForEpisode(p: Principal, episodeId: string) {
  const episode = await loadEpisode(p, episodeId, 'recovery.read');
  const plan = await DischargePlanModel.findOne({ hospitalId: requireTenant(p), episodeId: episode._id });
  if (!plan) throw errors.notFound('Discharge plan');
  return getDischargePlan(p, String(plan._id));
}

/** Edit the working draft. Approved versions are immutable — use `amend`. */
export async function updateDraft(p: Principal, planId: string, rawContent: unknown) {
  assertPermission(p, 'discharge.create');
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);
  const version = await DischargePlanVersionModel.findOne({ hospitalId, _id: plan.currentVersionId });
  if (!version) throw errors.notFound('Discharge plan version');
  if (version.status !== 'DRAFT') {
    throw version.status === 'APPROVED' || version.status === 'SUPERSEDED'
      ? errors.immutable()
      : errors.validation(`A ${version.status.toLowerCase()} version cannot be edited`);
  }
  const content = await validateContentRefs(hospitalId, rawContent);
  version.content = content;
  version.contentHash = hashContent(content);
  version.authoredBy = new Types.ObjectId(p.userId);
  await version.save();
  await audit({ action: 'DISCHARGE_PLAN_DRAFT_UPDATED', resourceType: 'DischargePlanVersion', resourceId: String(version._id), patientId: String(plan.patientId) });
  return version;
}

export async function submitPlan(p: Principal, planId: string, comment?: string) {
  assertPermission(p, 'discharge.create');
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);
  const version = await DischargePlanVersionModel.findOne({ hospitalId, _id: plan.currentVersionId });
  if (!version || version.status !== 'DRAFT') throw errors.validation('Only a draft version can be submitted for approval');

  return withTransaction(async (session) => {
    version.status = 'SUBMITTED';
    version.submittedBy = new Types.ObjectId(p.userId);
    version.submittedAt = new Date();
    await version.save({ session });
    plan.status = 'SUBMITTED';
    await plan.save({ session });
    const episode = await RecoveryEpisodeModel.findOne({ _id: plan.episodeId, hospitalId }).session(session);
    if (episode?.status === 'DRAFT') await applyTransition(episode, 'DISCHARGE_PENDING', 'Discharge plan submitted for approval', p.userId, session);
    await audit({ action: 'DISCHARGE_PLAN_SUBMITTED', resourceType: 'DischargePlanVersion', resourceId: String(version._id), patientId: String(plan.patientId), metadata: { comment: comment ? 'provided' : undefined } }, session);
    return { plan, version };
  });
}

function createOrdersFromContent(args: {
  hospitalId: Types.ObjectId;
  episodeId: Types.ObjectId;
  patientId: Types.ObjectId;
  versionId: Types.ObjectId;
  content: DischargeContent;
  startDate: string;
  approverId: string;
}) {
  const end = planEndDate(args.content, args.startDate);
  return args.content.medications.map((m, i) => {
    const start = m.schedule.startDate && m.schedule.startDate > args.startDate ? m.schedule.startDate : args.startDate;
    const medEnd = m.schedule.endDate ?? (m.schedule.durationDays ? addDays(start, m.schedule.durationDays - 1) : end);
    return {
      hospitalId: args.hospitalId,
      episodeId: args.episodeId,
      patientId: args.patientId,
      dischargePlanVersionId: args.versionId,
      sourceIndex: i,
      name: m.name,
      strength: m.strength,
      dose: m.dose,
      route: m.route,
      frequencyText: m.frequencyText,
      instructions: m.instructions,
      isPrn: m.isPrn,
      startDate: start,
      endDate: medEnd < end ? medEnd : end,
      status: 'ACTIVE' as const,
      approvedBy: new Types.ObjectId(args.approverId),
      approvedAt: new Date(),
    };
  });
}

/**
 * Approve or reject the submitted version. Approval (atomic):
 *  version → APPROVED (immutable), previous approved → SUPERSEDED, PlanApproval record,
 *  medication orders replaced, recovery plan + tasks generated, episode → ACTIVE.
 */
export async function decidePlan(
  p: Principal,
  planId: string,
  input: { decision: 'APPROVED' | 'REJECTED'; comment?: string; dischargeDate?: string; activate: boolean },
) {
  assertPermission(p, 'discharge.approve');
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);

  const result = await withTransaction(async (session) => {
    const version = await DischargePlanVersionModel.findOne({ hospitalId, _id: plan.currentVersionId }).session(session);
    if (!version || version.status !== 'SUBMITTED') throw errors.validation('Only a submitted version can be approved or rejected');
    const episode = await RecoveryEpisodeModel.findOne({ _id: plan.episodeId, hospitalId }).session(session);
    if (!episode) throw errors.notFound('Recovery episode');

    await PlanApprovalModel.create(
      [{ hospitalId, planId: plan._id, versionId: version._id, episodeId: episode._id, decision: input.decision, decidedBy: p.userId, decidedByRoles: p.roles, comment: input.comment, contentHash: version.contentHash }],
      { session },
    );

    if (input.decision === 'REJECTED') {
      version.status = 'REJECTED';
      await version.save({ session });
      plan.status = plan.approvedVersionId ? 'APPROVED' : 'REJECTED';
      // Start a fresh draft from the rejected content so authors can revise it.
      const [draft] = await DischargePlanVersionModel.create(
        [{ hospitalId, planId: plan._id, episodeId: episode._id, patientId: episode.patientId, versionNumber: version.versionNumber + 1, status: 'DRAFT', content: version.content, contentHash: version.contentHash, amendsVersionId: version.amendsVersionId, authoredBy: version.authoredBy }],
        { session },
      );
      plan.currentVersionId = draft!._id;
      plan.currentVersionNumber = draft!.versionNumber;
      await plan.save({ session });
      if (episode.status === 'DISCHARGE_PENDING') await applyTransition(episode, 'DRAFT', 'Discharge plan returned for revision', p.userId, session);
      await audit({ action: 'DISCHARGE_PLAN_REJECTED', resourceType: 'DischargePlanVersion', resourceId: String(version._id), patientId: String(episode.patientId) }, session);
      return { plan, version, episode, activated: false };
    }

    const content = dischargeContentSchema.parse(version.content);
    const patient = await PatientModel.findOne({ _id: episode.patientId, hospitalId }).session(session);
    const hospital = await HospitalModel.findById(hospitalId).session(session);
    const timezone = patient?.timezone ?? hospital?.timezone ?? 'Africa/Lagos';
    const today = DateTime.now().setZone(timezone).toISODate()!;
    const isAmendment = !!plan.approvedVersionId;
    const startDate = isAmendment ? today : (input.dischargeDate ?? episode.plannedDischargeDate ?? today);

    // Supersede previous approved version.
    if (plan.approvedVersionId) {
      await DischargePlanVersionModel.updateOne({ hospitalId, _id: plan.approvedVersionId }, { $set: { status: 'SUPERSEDED' } }, { session });
    }
    version.status = 'APPROVED';
    version.approvedBy = new Types.ObjectId(p.userId);
    version.approvedAt = new Date();
    await version.save({ session });
    plan.status = 'APPROVED';
    plan.approvedVersionId = version._id;
    await plan.save({ session });

    // Replace medication orders with those of the newly approved version.
    await MedicationOrderModel.updateMany(
      { hospitalId, episodeId: episode._id, status: 'ACTIVE' },
      { $set: { status: 'SUPERSEDED', discontinuedAt: new Date(), discontinuedBy: p.userId, discontinuedReason: `Superseded by discharge plan v${version.versionNumber}` } },
      { session },
    );
    await MedicationScheduleModel.updateMany({ hospitalId, episodeId: episode._id, active: true }, { $set: { active: false } }, { session });
    const orders = (await MedicationOrderModel.create(
      createOrdersFromContent({ hospitalId, episodeId: episode._id, patientId: episode.patientId as Types.ObjectId, versionId: version._id, content, startDate, approverId: p.userId }),
      { session, ordered: true },
    )) as MedicationOrderDocument[];

    let activated = false;
    const shouldActivate = input.activate && (episode.status === 'DISCHARGE_PENDING' || isAmendment);
    if (shouldActivate) {
      const recoveryPlan = await generatePlanFromVersion({ episode, version, medicationOrders: orders, startDate, timezone, session });
      episode.currentRecoveryPlanId = recoveryPlan._id;
      if (episode.status === 'DISCHARGE_PENDING') {
        episode.dischargeDate = startDate;
        episode.startDate = startDate;
        episode.expectedReviewDate = episode.expectedReviewDate ?? recoveryPlan.endDate;
        await applyTransition(episode, 'ACTIVE', 'Discharge plan approved; recovery programme activated', p.userId, session);
      } else {
        await episode.save({ session });
      }
      activated = true;
    }

    await audit(
      {
        action: isAmendment ? 'DISCHARGE_PLAN_AMENDMENT_APPROVED' : 'DISCHARGE_PLAN_APPROVED',
        resourceType: 'DischargePlanVersion',
        resourceId: String(version._id),
        patientId: String(episode.patientId),
        metadata: { versionNumber: version.versionNumber, medicationOrders: orders.length, activated },
      },
      session,
    );
    return { plan, version, episode, activated };
  });

  if (result.activated) {
    eventBus.emit('discharge.approved', {
      hospitalId: String(hospitalId),
      episodeId: String(result.episode._id),
      patientId: String(result.episode.patientId),
      planId: String(plan._id),
      versionId: String(result.version._id),
    });
    const patient = await PatientModel.findOne({ _id: result.episode.patientId, hospitalId }).select('userId');
    if (patient?.userId) {
      await notify({ userId: patient.userId, hospitalId, template: 'PROGRAMME_STATUS', data: { episodeId: String(result.episode._id) }, idempotencyKey: `plan-approved:${String(result.version._id)}` });
    }
  }
  return result;
}

/** Start an amendment of an approved plan (new DRAFT version; approved stays in force). */
export async function amendPlan(p: Principal, planId: string, input: { content: unknown; reason?: string }) {
  assertPermission(p, 'discharge.create');
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);
  if (!plan.approvedVersionId) throw errors.validation('Only approved plans can be amended');
  const current = await DischargePlanVersionModel.findOne({ hospitalId, _id: plan.currentVersionId });
  if (current && (current.status === 'DRAFT' || current.status === 'SUBMITTED') && !current._id.equals(plan.approvedVersionId)) {
    throw errors.conflict('An amendment is already in progress for this plan');
  }
  const content = await validateContentRefs(hospitalId, input.content);
  const last = await DischargePlanVersionModel.findOne({ hospitalId, planId: plan._id }).sort({ versionNumber: -1 });
  const version = await DischargePlanVersionModel.create({
    hospitalId,
    planId: plan._id,
    episodeId: plan.episodeId,
    patientId: plan.patientId,
    versionNumber: (last?.versionNumber ?? 0) + 1,
    status: 'DRAFT',
    content,
    contentHash: hashContent(content),
    amendsVersionId: plan.approvedVersionId,
    amendmentReason: input.reason,
    authoredBy: p.userId,
  });
  plan.currentVersionId = version._id;
  plan.currentVersionNumber = version.versionNumber;
  await plan.save();
  await audit({ action: 'DISCHARGE_PLAN_AMENDMENT_STARTED', resourceType: 'DischargePlanVersion', resourceId: String(version._id), patientId: String(plan.patientId), justification: input.reason });
  return version;
}

export async function recordUnderstanding(
  p: Principal,
  planId: string,
  input: { method: string; understood: boolean; notes?: string },
) {
  assertPermission(p, 'discharge.review');
  const { plan } = await loadPlan(p, planId, 'recovery.read');
  const hospitalId = requireTenant(p);
  const targetId = plan.approvedVersionId ?? plan.currentVersionId;
  const version = await DischargePlanVersionModel.findOne({ hospitalId, _id: targetId });
  if (!version) throw errors.notFound('Discharge plan version');
  version.patientUnderstanding.push({ ...input, recordedBy: new Types.ObjectId(p.userId), recordedAt: new Date() });
  await version.save();
  await audit({ action: 'PATIENT_UNDERSTANDING_RECORDED', resourceType: 'DischargePlanVersion', resourceId: String(version._id), patientId: String(plan.patientId), metadata: { method: input.method, understood: input.understood } });
  return version;
}

/** Submitted plans awaiting approval for the clinician's visible episodes. */
export async function listPendingApprovals(p: Principal) {
  assertPermission(p, 'discharge.approve');
  const hospitalId = requireTenant(p);
  const plans = await DischargePlanModel.find({ hospitalId, status: 'SUBMITTED' })
    .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
    .sort({ updatedAt: 1 });
  const visible = [];
  for (const plan of plans) {
    try {
      await loadEpisode(p, plan.episodeId as Types.ObjectId, 'recovery.read');
      visible.push(plan);
    } catch {
      /* not in this clinician's scope */
    }
  }
  return visible;
}
