import { DateTime } from 'luxon';
import type { DischargeContent, RecurrenceKind, TaskType } from '@recoveros/shared';

/**
 * RECOVERY PLAN ENGINE — pure functions (no I/O) so they are fully unit-testable.
 *
 * Converts an APPROVED discharge-plan version into activity definitions, and expands
 * activity recurrences into concrete task occurrences for a time window.
 *
 * Clinical safety rules:
 *  - Medication activities are generated ONLY from medication instructions present in
 *    the approved version and link to the MedicationOrder created from it. The engine
 *    never invents doses, frequencies or extra medication tasks.
 *  - PRN ("as needed") medications get no scheduled reminders.
 *  - No clinical schedule is invented: check-ins/wound care/rehab reminders exist only
 *    when the approving clinician configured them. Education read-through tasks are the
 *    only defaults (they repeat already-approved content).
 *
 * Time rules:
 *  - Wall-clock times are interpreted in the PATIENT's IANA timezone.
 *  - DST gaps: a non-existent local time moves forward by the gap (Luxon semantics);
 *  - DST overlaps: the earlier instant is used. Each local date/time yields exactly one task.
 *  - Deterministic dedupe keys make materialisation idempotent.
 */

export interface ResolvedRecurrence {
  kind: RecurrenceKind;
  timesOfDay: string[];
  daysOfWeek?: number[];
  intervalDays?: number;
  startDate: string; // YYYY-MM-DD (patient-local)
  endDate: string; // inclusive
}

export interface ActivityDraft {
  key: string;
  type: TaskType;
  title: string;
  instructions?: string;
  recurrence: ResolvedRecurrence;
  medicationIndex?: number;
  checkInTemplateId?: string;
  sourceSection: string;
}

export interface Occurrence {
  localDate: string;
  localTime: string;
  dueAt: Date;
}

export interface PlanContext {
  startDate: string; // discharge date (patient-local)
  defaultCheckInTime: string;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate()!;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function planEndDate(content: Pick<DischargeContent, 'programmeDurationDays'>, startDate: string): string {
  return addDays(startDate, content.programmeDurationDays - 1);
}

function resolveRecurrence(
  r: { kind: RecurrenceKind; timesOfDay?: string[]; daysOfWeek?: number[]; intervalDays?: number; startDate?: string; durationDays?: number; endDate?: string },
  planStart: string,
  planEnd: string,
): ResolvedRecurrence {
  const startDate = r.startDate && r.startDate > planStart ? r.startDate : planStart;
  let endDate = planEnd;
  if (r.kind === 'ONCE') endDate = startDate;
  else if (r.endDate) endDate = minDate(r.endDate, planEnd);
  else if (r.durationDays) endDate = minDate(addDays(startDate, r.durationDays - 1), planEnd);
  const timesOfDay = [...new Set(r.timesOfDay?.length ? r.timesOfDay : ['09:00'])].sort();
  return {
    kind: r.kind,
    timesOfDay: r.kind === 'ONCE' ? timesOfDay.slice(0, 1) : timesOfDay,
    daysOfWeek: r.daysOfWeek,
    intervalDays: r.intervalDays,
    startDate,
    endDate,
  };
}

/** Derive activity definitions from approved discharge content. */
export function buildActivities(content: DischargeContent, ctx: PlanContext): ActivityDraft[] {
  const planStart = ctx.startDate;
  const planEnd = planEndDate(content, planStart);
  const out: ActivityDraft[] = [];

  content.medications.forEach((m, i) => {
    if (m.isPrn) return;
    const strength = m.strength ? ` ${m.strength}` : '';
    out.push({
      key: `med-${i}`,
      type: 'MEDICATION',
      title: `${m.name}${strength} — ${m.dose}`,
      instructions: [m.frequencyText, m.instructions].filter(Boolean).join('. '),
      recurrence: resolveRecurrence(m.schedule, planStart, planEnd),
      medicationIndex: i,
      sourceSection: 'medications',
    });
  });

  if (content.checkInTemplateId) {
    const schedule = content.checkInSchedule ?? { kind: 'DAILY' as const, timesOfDay: [ctx.defaultCheckInTime] };
    out.push({
      key: 'checkin',
      type: 'CHECK_IN',
      title: 'Recovery check-in',
      instructions: 'Tell your care team how you are feeling today.',
      recurrence: resolveRecurrence(schedule, planStart, planEnd),
      checkInTemplateId: content.checkInTemplateId,
      sourceSection: 'checkInSchedule',
    });
  }

  content.activities.forEach((a, i) => {
    out.push({
      key: `act-${i}`,
      type: a.type,
      title: a.title,
      instructions: a.instructions,
      recurrence: resolveRecurrence(a.recurrence, planStart, planEnd),
      sourceSection: 'activities',
    });
  });

  content.education.forEach((e, i) => {
    out.push({
      key: `edu-${i}`,
      type: 'EDUCATION',
      title: `Read: ${e.title}`,
      instructions: e.details,
      recurrence: resolveRecurrence({ kind: 'ONCE', timesOfDay: ['10:00'] }, planStart, planEnd),
      sourceSection: 'education',
    });
  });

  content.followUps.forEach((f, i) => {
    if (!f.dueDate || f.dueDate < planStart) return;
    out.push({
      key: `fu-${i}`,
      type: 'APPOINTMENT_REMINDER',
      title: `Follow-up due: ${f.description}`,
      recurrence: resolveRecurrence({ kind: 'ONCE', timesOfDay: ['09:00'], startDate: f.dueDate }, planStart, addDays(f.dueDate, 1) > planEnd ? f.dueDate : planEnd),
      sourceSection: 'followUps',
    });
  });

  return out;
}

/** ISO weekday (1=Mon..7=Sun) of a calendar date. */
function isoWeekday(date: string): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday;
}

function daysBetween(a: string, b: string): number {
  return Math.round(DateTime.fromISO(b, { zone: 'utc' }).diff(DateTime.fromISO(a, { zone: 'utc' }), 'days').days);
}

/** Convert a patient-local wall-clock time to a UTC instant (DST-safe). */
export function localToInstant(date: string, time: string, timezone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!dt.isValid) throw new Error(`Invalid local time ${date} ${time} in ${timezone}`);
  return dt.toJSDate();
}

/**
 * Expand a recurrence into occurrences whose due instant falls in [from, to).
 */
export function expandOccurrences(r: ResolvedRecurrence, timezone: string, from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  const fromLocal = DateTime.fromJSDate(from, { zone: timezone }).toISODate()!;
  const toLocal = DateTime.fromJSDate(to, { zone: timezone }).toISODate()!;
  let date = r.startDate > fromLocal ? r.startDate : fromLocal;
  const last = r.endDate < toLocal ? r.endDate : toLocal;

  for (let guard = 0; date <= last && guard < 800; guard++, date = addDays(date, 1)) {
    let include = false;
    switch (r.kind) {
      case 'ONCE':
        include = date === r.startDate;
        break;
      case 'DAILY':
        include = true;
        break;
      case 'WEEKLY':
        include = (r.daysOfWeek ?? []).includes(isoWeekday(date));
        break;
      case 'EVERY_N_DAYS':
        include = daysBetween(r.startDate, date) % (r.intervalDays ?? 1) === 0;
        break;
    }
    if (!include) continue;
    for (const time of r.timesOfDay) {
      const dueAt = localToInstant(date, time, timezone);
      if (dueAt >= from && dueAt < to) out.push({ localDate: date, localTime: time, dueAt });
    }
  }
  return out;
}

export function taskDedupeKey(planId: string, activityKey: string, o: Pick<Occurrence, 'localDate' | 'localTime'>): string {
  return `${planId}:${activityKey}:${o.localDate}T${o.localTime}`;
}
