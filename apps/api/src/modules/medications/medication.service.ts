import { Types } from 'mongoose';
import type { MedicationEventInput } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeScopedFilter, loadEpisode } from '../access/access.service';
import { RecoveryTaskModel } from '../recovery-plans/recovery-plan.models';
import { evaluateRules } from '../alerts/alert-engine';
import { MedicationEventModel, MedicationOrderModel, MedicationScheduleModel } from './medication.models';

export async function listEpisodeMedications(p: Principal, episodeId: string, includeInactive = false) {
  const episode = await loadEpisode(p, episodeId, 'medication.read');
  const hospitalId = requireTenant(p);
  const filter: Record<string, unknown> = { hospitalId, episodeId: episode._id };
  if (!includeInactive) filter.status = 'ACTIVE';
  const orders = await MedicationOrderModel.find(filter).sort({ status: 1, name: 1 });
  const schedules = await MedicationScheduleModel.find({ hospitalId, episodeId: episode._id, active: true });
  return orders.map((o) => ({
    ...o.toJSON(),
    schedule: schedules.find((s) => String(s.medicationOrderId) === String(o._id)) ?? null,
    disclaimer: 'Prescribed by your care team. Do not change how you take this medicine without speaking to them.',
  }));
}

/** Change history = all orders (incl. superseded/discontinued) with provenance. */
export async function medicationHistory(p: Principal, episodeId: string) {
  return listEpisodeMedications(p, episodeId, true);
}

export async function listMedicationEvents(p: Principal, episodeId: string, q: { page: number; limit: number }) {
  const episode = await loadEpisode(p, episodeId, 'medication.read');
  const filter = { hospitalId: requireTenant(p), episodeId: episode._id };
  const [items, total] = await Promise.all([
    MedicationEventModel.find(filter).populate({ path: 'medicationOrderId', select: 'name strength dose', options: { skipTenantGuard: true } }).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    MedicationEventModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

/**
 * Record a PATIENT/CAREGIVER-REPORTED dose status. Idempotent by idempotencyKey.
 * Access problems, side effects and explicit review requests flag the event for
 * pharmacist review; hospital alert rules (source MEDICATION_EVENT) are evaluated.
 */
export async function reportMedicationEvent(p: Principal, input: MedicationEventInput) {
  if (p.kind === 'STAFF') throw errors.forbidden('Dose events are reported by patients or caregivers');
  const hospitalId = requireTenant(p);
  const existing = await MedicationEventModel.findOne({ hospitalId, idempotencyKey: input.idempotencyKey });
  if (existing) return { event: existing, duplicate: true, safetyMessages: [] };

  const order = await MedicationOrderModel.findOne({ _id: input.medicationOrderId, hospitalId });
  if (!order) throw errors.notFound('Medication');
  // Both checks are per-patient (a caregiver's consent must cover both).
  const episode = await loadEpisode(p, order.episodeId as Types.ObjectId, 'checkins.create');
  await loadEpisode(p, order.episodeId as Types.ObjectId, 'medication.read');
  if (order.status !== 'ACTIVE') throw errors.validation('This medication is no longer active in your plan');

  const requiresReview = !!(input.accessProblem || input.sideEffects || input.requestPharmacistReview || input.status === 'UNABLE_TO_OBTAIN');
  const event = await MedicationEventModel.create({
    hospitalId,
    medicationOrderId: order._id,
    episodeId: episode._id,
    patientId: episode.patientId,
    taskId: input.taskId,
    scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
    status: input.status,
    reportedTakenAt: input.reportedTakenAt ? new Date(input.reportedTakenAt) : undefined,
    reportedBy: p.userId,
    reporterKind: p.kind,
    reason: input.reason,
    sideEffects: input.sideEffects,
    accessProblem: input.accessProblem,
    requiresReview,
    reviewStatus: requiresReview ? 'PENDING_REVIEW' : 'NO_REVIEW_REQUIRED',
    idempotencyKey: input.idempotencyKey,
  });

  if (input.taskId) {
    await RecoveryTaskModel.updateOne(
      { _id: input.taskId, hospitalId, episodeId: episode._id, medicationOrderId: order._id, status: { $in: ['PENDING', 'MISSED'] } },
      {
        $set: {
          status: input.status === 'REPORTED_TAKEN' || input.status === 'REPORTED_DELAYED' ? 'COMPLETED' : 'MISSED',
          completionSource: p.kind,
          completedAt: new Date(),
          completedBy: p.userId,
          evidenceRef: { kind: 'MedicationEvent', id: event._id },
        },
      },
    );
  }
  if (requiresReview && order.pharmacistReview?.status !== 'IN_PROGRESS') {
    order.set('pharmacistReview.status', 'REQUESTED');
    order.set('pharmacistReview.requestedAt', new Date());
    order.set('pharmacistReview.requestedReason', input.accessProblem ? `Access problem: ${input.accessProblem}` : input.sideEffects ? 'Patient-reported side effects' : 'Patient requested review');
    await order.save();
  }

  const evaluation = await evaluateRules({
    hospitalId,
    episode,
    source: 'MEDICATION_EVENT',
    sourceRef: { kind: 'MedicationEvent', id: event._id },
    facts: {
      status: input.status,
      accessProblem: input.accessProblem ?? null,
      hasSideEffects: !!input.sideEffects,
      requestPharmacistReview: input.requestPharmacistReview,
      medicationName: order.name,
      recentMissedCount: await MedicationEventModel.countDocuments({
        hospitalId,
        episodeId: episode._id,
        status: { $in: ['REPORTED_MISSED', 'NOT_RESPONDED', 'UNABLE_TO_OBTAIN'] },
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600_000) },
      }),
    },
  });

  eventBus.emit('medication.event_reported', { hospitalId: String(hospitalId), episodeId: String(episode._id), patientId: String(episode.patientId), eventId: String(event._id), status: input.status });
  await audit({ action: 'MEDICATION_EVENT_REPORTED', resourceType: 'MedicationEvent', resourceId: String(event._id), patientId: String(episode.patientId), metadata: { status: input.status, requiresReview } });
  return { event, duplicate: false, safetyMessages: evaluation.safetyMessages };
}

/** Pharmacist queue: medication concerns needing review within visible episodes. */
export async function listMedicationConcerns(p: Principal, q: { page: number; limit: number }) {
  assertPermission(p, 'medication.review');
  const filter = { ...(await episodeScopedFilter(p, 'medication.read')), reviewStatus: 'PENDING_REVIEW' };
  const [items, total] = await Promise.all([
    MedicationEventModel.find(filter)
      .populate({ path: 'medicationOrderId', select: 'name strength dose', options: { skipTenantGuard: true } })
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .sort({ createdAt: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    MedicationEventModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function reviewMedicationEvent(p: Principal, eventId: string, notes?: string) {
  assertPermission(p, 'medication.review');
  const hospitalId = requireTenant(p);
  const event = await MedicationEventModel.findOne({ _id: eventId, hospitalId });
  if (!event) throw errors.notFound('Medication event');
  await loadEpisode(p, event.episodeId as Types.ObjectId, 'medication.read');
  event.reviewStatus = 'REVIEWED';
  event.reviewedBy = new Types.ObjectId(p.userId);
  event.reviewedAt = new Date();
  event.reviewNotes = notes;
  await event.save();
  await MedicationOrderModel.updateOne(
    { _id: event.medicationOrderId, hospitalId, 'pharmacistReview.status': { $in: ['REQUESTED', 'IN_PROGRESS'] } },
    { $set: { 'pharmacistReview.status': 'COMPLETED', 'pharmacistReview.reviewedBy': p.userId, 'pharmacistReview.reviewedAt': new Date(), 'pharmacistReview.notes': notes } },
  );
  await audit({ action: 'MEDICATION_CONCERN_REVIEWED', resourceType: 'MedicationEvent', resourceId: eventId, patientId: String(event.patientId) });
  return event;
}

/**
 * Discontinue an order (clinician decision). Changing a dose is NOT supported here —
 * dose/frequency changes require amending and re-approving the discharge plan.
 */
export async function discontinueOrder(p: Principal, orderId: string, reason: string) {
  assertPermission(p, 'medication.manage');
  assertPermission(p, 'recovery.approve');
  const hospitalId = requireTenant(p);
  const order = await MedicationOrderModel.findOne({ _id: orderId, hospitalId });
  if (!order) throw errors.notFound('Medication');
  await loadEpisode(p, order.episodeId as Types.ObjectId, 'medication.read');
  if (order.status !== 'ACTIVE') throw errors.validation('Medication is not active');
  order.status = 'DISCONTINUED';
  order.discontinuedAt = new Date();
  order.discontinuedBy = new Types.ObjectId(p.userId);
  order.discontinuedReason = reason;
  await order.save();
  await MedicationScheduleModel.updateMany({ hospitalId, medicationOrderId: order._id }, { $set: { active: false } });
  await RecoveryTaskModel.updateMany({ hospitalId, medicationOrderId: order._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } });
  await audit({ action: 'MEDICATION_DISCONTINUED', resourceType: 'MedicationOrder', resourceId: orderId, patientId: String(order.patientId), justification: reason });
  return order;
}
