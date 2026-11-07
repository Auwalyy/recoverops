import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import { APPOINTMENT_TRANSITIONS, canTransition, type AppointmentStatus } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { logger } from '../../config/logger';
import { eventBus } from '../../events/event-bus';
import { registerProcessor } from '../../jobs/queue';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeScopedFilter, loadEpisode } from '../access/access.service';
import { UserRoleModel } from '../access/access.models';
import { PatientModel } from '../patients/patient.model';
import { notify } from '../notifications/notification.service';
import { evaluateRules } from '../alerts/alert-engine';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { AppointmentModel, type AppointmentDocument } from './appointment.model';

async function loadAppointment(p: Principal, id: string, permission: 'appointments.read' | 'appointments.manage'): Promise<AppointmentDocument> {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(id)) throw errors.notFound('Appointment');
  const a = await AppointmentModel.findOne({ _id: id, hospitalId });
  if (!a) throw errors.notFound('Appointment');
  await loadEpisode(p, a.episodeId as Types.ObjectId, permission === 'appointments.manage' ? 'appointments.manage' : 'appointments.read');
  return a;
}

function move(a: AppointmentDocument, to: AppointmentStatus, by: string, reason?: string) {
  const from = a.status as AppointmentStatus;
  if (!canTransition(APPOINTMENT_TRANSITIONS, from, to)) throw errors.invalidTransition(from, to, 'appointment');
  a.status = to;
  a.history.push({ from, to, at: new Date(), by: new Types.ObjectId(by), reason });
}

async function notifyPatient(a: AppointmentDocument, template: 'APPOINTMENT_CHANGED' | 'APPOINTMENT_REMINDER', key: string, vars?: Record<string, string>) {
  const patient = await PatientModel.findOne({ _id: a.patientId, hospitalId: a.hospitalId }).select('userId');
  if (!patient?.userId) return;
  await notify({ userId: patient.userId, hospitalId: a.hospitalId, template, vars, data: { appointmentId: String(a._id) }, idempotencyKey: key });
}

export async function createAppointment(
  p: Principal,
  input: { episodeId: string; clinicianId?: string; type: string; mode: string; scheduledAt: string; durationMinutes: number; location?: string; instructions?: string; reminderOffsetsMinutes: number[] },
) {
  assertPermission(p, 'appointments.manage');
  const episode = await loadEpisode(p, input.episodeId, 'appointments.manage');
  const hospitalId = requireTenant(p);
  if (['COMPLETED', 'TRANSFERRED', 'CANCELLED'].includes(episode.status)) throw errors.validation('Cannot book appointments on a closed episode');
  if (input.clinicianId && !(await UserRoleModel.exists({ hospitalId, userId: input.clinicianId, status: 'ACTIVE' }))) {
    throw errors.validation('Clinician must be staff of this hospital');
  }
  const a = await AppointmentModel.create({
    ...input,
    scheduledAt: new Date(input.scheduledAt),
    hospitalId,
    episodeId: episode._id,
    patientId: episode.patientId,
    createdBy: p.userId,
    history: [{ to: 'SCHEDULED', at: new Date(), by: p.userId }],
  });
  await notifyPatient(a, 'APPOINTMENT_CHANGED', `appt:${String(a._id)}:created`);
  eventBus.emit('appointment.changed', { hospitalId: String(hospitalId), appointmentId: String(a._id), patientId: String(a.patientId), status: a.status });
  await audit({ action: 'APPOINTMENT_CREATED', resourceType: 'Appointment', resourceId: String(a._id), patientId: String(a.patientId), metadata: { type: input.type } });
  return a;
}

export async function listAppointments(p: Principal, q: { episodeId?: string; from?: string; to?: string; status?: string; mine?: boolean; page: number; limit: number }) {
  let filter: Record<string, unknown>;
  if (q.episodeId) {
    const ep = await loadEpisode(p, q.episodeId, 'appointments.read');
    filter = { hospitalId: requireTenant(p), episodeId: ep._id };
  } else {
    filter = await episodeScopedFilter(p, 'appointments.read');
  }
  const when: Record<string, Date> = {};
  if (q.from) when.$gte = new Date(q.from);
  if (q.to) when.$lt = new Date(q.to);
  if (Object.keys(when).length) filter.scheduledAt = when;
  if (q.status) filter.status = q.status;
  if (q.mine && p.kind === 'STAFF') filter.clinicianId = new Types.ObjectId(p.userId);
  const [items, total] = await Promise.all([
    AppointmentModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .populate('clinicianId', 'firstName lastName')
      .sort({ scheduledAt: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AppointmentModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function getAppointment(p: Principal, id: string) {
  const a = await loadAppointment(p, id, 'appointments.read');
  await a.populate('clinicianId', 'firstName lastName');
  if (p.kind !== 'STAFF') {
    const json = a.toJSON() as Record<string, unknown>;
    delete json.followUpNotes;
    delete json.history;
    return json;
  }
  return a;
}

export async function updateAppointment(
  p: Principal,
  id: string,
  input: { clinicianId?: string; scheduledAt?: string; durationMinutes?: number; location?: string; instructions?: string; mode?: string; status?: 'CANCELLED' | 'ATTENDED' | 'MISSED'; reason?: string; followUpNote?: string },
) {
  assertPermission(p, 'appointments.manage');
  const a = await loadAppointment(p, id, 'appointments.manage');
  const { status, reason, followUpNote, scheduledAt, ...fields } = input;
  a.set(fields);
  if (scheduledAt) {
    a.scheduledAt = new Date(scheduledAt);
    move(a, 'SCHEDULED', p.userId, reason ?? 'Rescheduled');
    a.rescheduleRequest = undefined;
  }
  if (followUpNote) a.followUpNotes.push({ note: followUpNote, authorId: new Types.ObjectId(p.userId), at: new Date() });
  if (status) {
    move(a, status, p.userId, reason);
    if (status === 'CANCELLED') a.cancellation = { cancelledAt: new Date(), cancelledBy: new Types.ObjectId(p.userId), reason };
    if (status === 'ATTENDED' || status === 'MISSED') a.attendance = { recordedAt: new Date(), recordedBy: new Types.ObjectId(p.userId), attended: status === 'ATTENDED' };
  }
  await a.save();

  if (status === 'MISSED') {
    const episode = await RecoveryEpisodeModel.findOne({ _id: a.episodeId, hospitalId: a.hospitalId });
    if (episode) {
      const missedCount = await AppointmentModel.countDocuments({ hospitalId: a.hospitalId, episodeId: a.episodeId, status: 'MISSED' });
      await evaluateRules({
        hospitalId: a.hospitalId,
        episode,
        source: 'APPOINTMENT_MISSED',
        sourceRef: { kind: 'Appointment', id: a._id },
        facts: { appointmentType: a.type, missedAppointmentCount: missedCount },
      });
    }
  }
  if (scheduledAt || status === 'CANCELLED') await notifyPatient(a, 'APPOINTMENT_CHANGED', `appt:${id}:${a.history.length}`);
  eventBus.emit('appointment.changed', { hospitalId: String(a.hospitalId), appointmentId: id, patientId: String(a.patientId), status: a.status });
  await audit({ action: 'APPOINTMENT_UPDATED', resourceType: 'Appointment', resourceId: id, patientId: String(a.patientId), metadata: { status, rescheduled: !!scheduledAt } });
  return a;
}

/** Patient/caregiver confirmation or reschedule request. */
export async function respondToAppointment(p: Principal, id: string, input: { action: 'CONFIRM' | 'REQUEST_RESCHEDULE'; reason?: string; preferredDates?: string[] }) {
  if (p.kind === 'STAFF') throw errors.forbidden('Use the appointment management endpoints');
  const a = await loadAppointment(p, id, 'appointments.read');
  if (input.action === 'CONFIRM') {
    move(a, 'CONFIRMED', p.userId);
    a.patientConfirmedAt = new Date();
  } else {
    move(a, 'RESCHEDULE_REQUESTED', p.userId, input.reason);
    a.rescheduleRequest = { requestedAt: new Date(), reason: input.reason, preferredDates: input.preferredDates ?? [], requestedBy: new Types.ObjectId(p.userId) };
  }
  await a.save();
  eventBus.emit('appointment.changed', { hospitalId: String(a.hospitalId), appointmentId: id, patientId: String(a.patientId), status: a.status });
  await audit({ action: `APPOINTMENT_${input.action}`, resourceType: 'Appointment', resourceId: id, patientId: String(a.patientId) });
  return a;
}

/** Background: send reminders at each configured offset before the appointment. */
export async function sendAppointmentReminders(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 7 * 24 * 3600_000);
  const upcoming = await AppointmentModel.find({ status: { $in: ['SCHEDULED', 'CONFIRMED'] }, scheduledAt: { $gt: now, $lte: horizon } })
    .setOptions({ skipTenantGuard: true })
    .limit(5000);
  let sent = 0;
  for (const a of upcoming) {
    for (const offset of a.reminderOffsetsMinutes ?? []) {
      const at = a.scheduledAt.getTime() - offset * 60_000;
      // Fire in the 15-minute window after the reminder time (job runs every 15 min).
      if (now.getTime() >= at && now.getTime() < at + 15 * 60_000) {
        const patient = await PatientModel.findOne({ _id: a.patientId, hospitalId: a.hospitalId }).select('timezone');
        const when = DateTime.fromJSDate(a.scheduledAt, { zone: patient?.timezone ?? 'Africa/Lagos' }).toFormat("ccc d LLL 'at' HH:mm");
        try {
          await notifyPatient(a, 'APPOINTMENT_REMINDER', `appt:${String(a._id)}:reminder:${offset}`, { when: `on ${when}` });
          sent++;
        } catch (err) {
          logger.error({ err }, 'Appointment reminder failed');
        }
      }
    }
  }
  return sent;
}

registerProcessor('appointments.reminders', async () => {
  await sendAppointmentReminders();
});
