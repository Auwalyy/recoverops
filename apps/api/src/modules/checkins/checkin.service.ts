import { Types } from 'mongoose';
import type { SubmitCheckInInput, SubmitSymptomInput } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeScopedFilter, loadEpisode } from '../access/access.service';
import { DocumentModel } from '../documents/document.model';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { RecoveryTaskModel } from '../recovery-plans/recovery-plan.models';
import { evaluateRules } from '../alerts/alert-engine';
import { CheckInModel, CheckInTemplateModel, SymptomReportModel, type CheckInTemplateDocument } from './checkin.models';

const REPORTABLE_EPISODE_STATUSES = ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW'];

/* ------------------------------- Templates ------------------------------- */

export async function listTemplates(p: Principal, includeDrafts = false) {
  const filter: Record<string, unknown> = { hospitalId: requireTenant(p) };
  if (!(includeDrafts && p.permissions.has('checkins.templates.manage'))) filter.status = 'ACTIVE';
  return CheckInTemplateModel.find(filter).sort({ name: 1, version: -1 });
}

export async function getTemplate(p: Principal, id: string) {
  const t = await CheckInTemplateModel.findOne({ _id: id, hospitalId: requireTenant(p) });
  if (!t) throw errors.notFound('Check-in template');
  if (t.status !== 'ACTIVE' && !p.permissions.has('checkins.templates.manage')) throw errors.notFound('Check-in template');
  return t;
}

export async function createTemplate(p: Principal, input: { name: string; kind: string; description?: string; questions: unknown[] }) {
  assertPermission(p, 'checkins.templates.manage');
  const keys = (input.questions as Array<{ key: string }>).map((q) => q.key);
  if (new Set(keys).size !== keys.length) throw errors.validation('Question keys must be unique');
  const t = await CheckInTemplateModel.create({ ...input, hospitalId: requireTenant(p), status: 'DRAFT', createdBy: p.userId });
  t.familyId = t._id;
  await t.save();
  await audit({ action: 'CHECKIN_TEMPLATE_CREATED', resourceType: 'CheckInTemplate', resourceId: String(t._id) });
  return t;
}

/** Clinical approval activates a template and retires the previous version of its family. */
export async function approveTemplate(p: Principal, id: string) {
  assertPermission(p, 'alerts.rules.approve');
  const hospitalId = requireTenant(p);
  const t = await CheckInTemplateModel.findOne({ _id: id, hospitalId });
  if (!t) throw errors.notFound('Check-in template');
  if (t.status !== 'DRAFT') throw errors.validation('Only draft templates can be approved');
  await CheckInTemplateModel.updateMany({ hospitalId, familyId: t.familyId, status: 'ACTIVE' }, { $set: { status: 'RETIRED' } });
  t.status = 'ACTIVE';
  t.approvedBy = new Types.ObjectId(p.userId);
  t.approvedAt = new Date();
  await t.save();
  await audit({ action: 'CHECKIN_TEMPLATE_APPROVED', resourceType: 'CheckInTemplate', resourceId: id });
  return t;
}

/** Editing an active template creates a new DRAFT version in the same family. */
export async function reviseTemplate(p: Principal, id: string, input: { name: string; kind: string; description?: string; questions: unknown[] }) {
  assertPermission(p, 'checkins.templates.manage');
  const hospitalId = requireTenant(p);
  const t = await CheckInTemplateModel.findOne({ _id: id, hospitalId });
  if (!t) throw errors.notFound('Check-in template');
  if (t.status === 'DRAFT') {
    t.set(input);
    await t.save();
    return t;
  }
  const latest = await CheckInTemplateModel.findOne({ hospitalId, familyId: t.familyId }).sort({ version: -1 });
  return CheckInTemplateModel.create({ ...input, hospitalId, familyId: t.familyId, version: (latest?.version ?? 1) + 1, status: 'DRAFT', createdBy: p.userId });
}

/* ------------------------------- Check-ins ------------------------------- */

/** Validate answers strictly against the template (types, ranges, options, required). */
export function validateAnswers(template: Pick<CheckInTemplateDocument, 'questions'>, answers: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  const issues: Array<{ path: string; message: string }> = [];
  const known = new Set(template.questions.map((q) => q.key));
  for (const key of Object.keys(answers)) if (!known.has(key)) issues.push({ path: key, message: 'Unknown question' });

  for (const q of template.questions) {
    const v = answers[q.key];
    if (v === undefined || v === null || v === '') {
      if (q.required) issues.push({ path: q.key, message: 'This question is required' });
      continue;
    }
    const options = (q.options ?? []).map((o) => o.value);
    switch (q.type) {
      case 'SCALE':
      case 'NUMBER': {
        if (typeof v !== 'number' || !Number.isFinite(v)) issues.push({ path: q.key, message: 'Must be a number' });
        else if ((q.min !== undefined && q.min !== null && v < q.min) || (q.max !== undefined && q.max !== null && v > q.max)) issues.push({ path: q.key, message: `Must be between ${q.min} and ${q.max}` });
        else clean[q.key] = v;
        break;
      }
      case 'BOOLEAN':
        if (typeof v !== 'boolean') issues.push({ path: q.key, message: 'Must be yes or no' });
        else clean[q.key] = v;
        break;
      case 'SINGLE_CHOICE':
        if (typeof v !== 'string' || !options.includes(v)) issues.push({ path: q.key, message: 'Invalid option' });
        else clean[q.key] = v;
        break;
      case 'MULTI_CHOICE':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !options.includes(x))) issues.push({ path: q.key, message: 'Invalid option(s)' });
        else clean[q.key] = [...new Set(v)];
        break;
      case 'TEXT':
        if (typeof v !== 'string' || v.length > 2000) issues.push({ path: q.key, message: 'Must be text up to 2000 characters' });
        else clean[q.key] = v.trim();
        break;
    }
  }
  if (issues.length) throw errors.validation('Some answers are invalid', issues);
  return clean;
}

async function assertAttachments(hospitalId: Types.ObjectId, patientId: Types.ObjectId, ids?: string[]) {
  if (!ids?.length) return;
  const count = await DocumentModel.countDocuments({ hospitalId, patientId, _id: { $in: ids }, status: 'ACTIVE' });
  if (count !== ids.length) throw errors.validation('One or more attachments are invalid');
}

/**
 * Submit a patient-reported check-in. Idempotent (offline queue safe). Approved alert
 * rules are evaluated synchronously so any patient safety message is returned in the
 * same response.
 */
export async function submitCheckIn(p: Principal, input: SubmitCheckInInput) {
  if (p.kind !== 'PATIENT' && p.kind !== 'CAREGIVER') throw errors.forbidden('Check-ins are submitted by patients or authorised caregivers');
  const hospitalId = requireTenant(p);
  const existing = await CheckInModel.findOne({ hospitalId, idempotencyKey: input.idempotencyKey });
  if (existing) return { checkIn: existing, duplicate: true, safetyMessages: [] };

  const episode = await loadEpisode(p, input.episodeId, 'checkins.create');
  if (!REPORTABLE_EPISODE_STATUSES.includes(episode.status)) throw errors.validation('Check-ins are only accepted for active recovery programmes');
  const template = await CheckInTemplateModel.findOne({ _id: input.templateId, hospitalId, status: 'ACTIVE' });
  if (!template) throw errors.validation('This check-in form is not available');
  const answers = validateAnswers(template, input.answers);
  await assertAttachments(hospitalId, episode.patientId as Types.ObjectId, input.attachmentIds);

  let checkIn;
  try {
    checkIn = await CheckInModel.create({
      hospitalId,
      episodeId: episode._id,
      patientId: episode.patientId,
      templateId: template._id,
      templateVersion: template.version,
      taskId: input.taskId,
      answers,
      notes: input.notes,
      attachmentIds: input.attachmentIds,
      submittedBy: p.userId,
      reporterKind: p.kind,
      clientSubmittedAt: input.clientSubmittedAt ? new Date(input.clientSubmittedAt) : undefined,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      const dup = await CheckInModel.findOne({ hospitalId, idempotencyKey: input.idempotencyKey });
      return { checkIn: dup, duplicate: true, safetyMessages: [] };
    }
    throw err;
  }

  // Complete the linked task, or today's pending check-in task.
  const taskFilter: Record<string, unknown> = input.taskId
    ? { _id: new Types.ObjectId(input.taskId), hospitalId, episodeId: episode._id, type: 'CHECK_IN' }
    : { hospitalId, episodeId: episode._id, type: 'CHECK_IN', status: 'PENDING', dueAt: { $lte: new Date(Date.now() + 12 * 3600_000), $gte: new Date(Date.now() - 24 * 3600_000) } };
  await RecoveryTaskModel.findOneAndUpdate(
    { ...taskFilter, status: { $in: ['PENDING', 'MISSED'] } },
    { $set: { status: 'COMPLETED', completionSource: p.kind, completedAt: new Date(), completedBy: p.userId, evidenceRef: { kind: 'CheckIn', id: checkIn._id } } },
    { sort: { dueAt: 1 } },
  );
  await RecoveryEpisodeModel.updateOne({ _id: episode._id, hospitalId }, { $set: { 'stats.lastCheckInAt': new Date() } });

  const evaluation = await evaluateRules({
    hospitalId,
    episode,
    source: 'CHECK_IN',
    sourceRef: { kind: 'CheckIn', id: checkIn._id },
    checkInTemplateId: template._id,
    facts: { answers, templateKind: template.kind, reporterKind: p.kind, hasAttachments: !!input.attachmentIds?.length },
  });
  if (evaluation.alerts.length) {
    checkIn.alertIds = evaluation.alerts.map((a) => a._id);
    await checkIn.save();
  }
  eventBus.emit('checkin.submitted', { hospitalId: String(hospitalId), episodeId: String(episode._id), patientId: String(episode.patientId), checkInId: String(checkIn._id) });
  await audit({ action: 'CHECKIN_SUBMITTED', resourceType: 'CheckIn', resourceId: String(checkIn._id), patientId: String(episode.patientId), metadata: { alerts: evaluation.alerts.length } });
  return { checkIn, duplicate: false, safetyMessages: evaluation.safetyMessages };
}

export async function getCheckIn(p: Principal, id: string) {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(id)) throw errors.notFound('Check-in');
  const c = await CheckInModel.findOne({ _id: id, hospitalId }).populate({ path: 'templateId', select: 'name kind questions version', options: { skipTenantGuard: true } });
  if (!c) throw errors.notFound('Check-in');
  await loadEpisode(p, c.episodeId as Types.ObjectId, p.kind === 'STAFF' ? 'checkins.read' : 'recovery.read');
  return c;
}

export async function listEpisodeCheckIns(p: Principal, episodeId: string, q: { page: number; limit: number }) {
  const episode = await loadEpisode(p, episodeId, p.kind === 'STAFF' ? 'checkins.read' : 'recovery.read');
  const filter = { hospitalId: requireTenant(p), episodeId: episode._id };
  const [items, total] = await Promise.all([
    CheckInModel.find(filter).populate({ path: 'templateId', select: 'name kind', options: { skipTenantGuard: true } }).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    CheckInModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

/** Staff review queue of check-ins awaiting review. */
export async function checkInReviewQueue(p: Principal, q: { page: number; limit: number }) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const filter = { ...(await episodeScopedFilter(p, 'checkins.read')), reviewStatus: 'PENDING_REVIEW' };
  const [items, total] = await Promise.all([
    CheckInModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .populate({ path: 'templateId', select: 'name kind questions', options: { skipTenantGuard: true } })
      .sort({ createdAt: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    CheckInModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function reviewCheckIn(p: Principal, id: string, notes?: string) {
  assertPermission(p, 'recovery.update');
  const c = await getCheckIn(p, id);
  c.reviewStatus = 'REVIEWED';
  c.reviewedBy = new Types.ObjectId(p.userId);
  c.reviewedAt = new Date();
  c.clinicianNotes = notes;
  await c.save();
  await audit({ action: 'CHECKIN_REVIEWED', resourceType: 'CheckIn', resourceId: id, patientId: String(c.patientId) });
  return c;
}

/** Missed check-in queue for coordinators/nurses. */
export async function missedCheckInQueue(p: Principal, q: { page: number; limit: number }) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const filter = { ...(await episodeScopedFilter(p, 'checkins.read')), type: 'CHECK_IN', status: 'MISSED', dueAt: { $gte: new Date(Date.now() - 7 * 24 * 3600_000) } };
  const [items, total] = await Promise.all([
    RecoveryTaskModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef phone', options: { skipTenantGuard: true } })
      .sort({ dueAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    RecoveryTaskModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

/* ------------------------------- Symptoms ------------------------------- */

export async function submitSymptom(p: Principal, input: SubmitSymptomInput) {
  if (p.kind !== 'PATIENT' && p.kind !== 'CAREGIVER') throw errors.forbidden('Symptoms are reported by patients or authorised caregivers');
  const hospitalId = requireTenant(p);
  const existing = await SymptomReportModel.findOne({ hospitalId, idempotencyKey: input.idempotencyKey });
  if (existing) return { symptom: existing, duplicate: true, safetyMessages: [] };
  const episode = await loadEpisode(p, input.episodeId, 'checkins.create');
  if (!REPORTABLE_EPISODE_STATUSES.includes(episode.status)) throw errors.validation('Symptom reports are only accepted for active recovery programmes');
  await assertAttachments(hospitalId, episode.patientId as Types.ObjectId, input.attachmentIds);

  const symptom = await SymptomReportModel.create({
    ...input,
    onsetAt: input.onsetAt ? new Date(input.onsetAt) : undefined,
    hospitalId,
    episodeId: episode._id,
    patientId: episode.patientId,
    submittedBy: p.userId,
    reporterKind: p.kind,
  });
  const evaluation = await evaluateRules({
    hospitalId,
    episode,
    source: 'SYMPTOM_REPORT',
    sourceRef: { kind: 'SymptomReport', id: symptom._id },
    facts: {
      symptomCode: input.symptomCode ?? null,
      severity: input.severity,
      trend: input.trend,
      description: input.description,
      hasAttachments: !!input.attachmentIds?.length,
      reporterKind: p.kind,
    },
  });
  if (evaluation.alerts.length) {
    symptom.alertIds = evaluation.alerts.map((a) => a._id);
    await symptom.save();
  }
  eventBus.emit('symptom.reported', { hospitalId: String(hospitalId), episodeId: String(episode._id), patientId: String(episode.patientId), symptomId: String(symptom._id) });
  await audit({ action: 'SYMPTOM_REPORTED', resourceType: 'SymptomReport', resourceId: String(symptom._id), patientId: String(episode.patientId), metadata: { severity: input.severity, alerts: evaluation.alerts.length } });
  return { symptom, duplicate: false, safetyMessages: evaluation.safetyMessages };
}

export async function getSymptom(p: Principal, id: string) {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(id)) throw errors.notFound('Symptom report');
  const s = await SymptomReportModel.findOne({ _id: id, hospitalId });
  if (!s) throw errors.notFound('Symptom report');
  await loadEpisode(p, s.episodeId as Types.ObjectId, p.kind === 'STAFF' ? 'checkins.read' : 'recovery.read');
  return s;
}

export async function listSymptoms(p: Principal, q: { episodeId?: string; pending?: boolean; page: number; limit: number }) {
  let filter: Record<string, unknown>;
  if (q.episodeId) {
    const episode = await loadEpisode(p, q.episodeId, p.kind === 'STAFF' ? 'checkins.read' : 'recovery.read');
    filter = { hospitalId: requireTenant(p), episodeId: episode._id };
  } else {
    filter = await episodeScopedFilter(p, p.kind === 'STAFF' ? 'checkins.read' : 'recovery.read');
  }
  if (q.pending) filter.reviewStatus = 'PENDING_REVIEW';
  const [items, total] = await Promise.all([
    SymptomReportModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    SymptomReportModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function reviewSymptom(p: Principal, id: string, notes?: string) {
  assertPermission(p, 'recovery.update');
  const s = await getSymptom(p, id);
  s.reviewStatus = 'REVIEWED';
  s.reviewedBy = new Types.ObjectId(p.userId);
  s.reviewedAt = new Date();
  s.clinicianNotes = notes;
  await s.save();
  await audit({ action: 'SYMPTOM_REVIEWED', resourceType: 'SymptomReport', resourceId: id, patientId: String(s.patientId) });
  return s;
}
