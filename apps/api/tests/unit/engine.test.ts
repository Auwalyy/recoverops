import { describe, expect, it } from 'vitest';
import { dischargeContentSchema } from '@recoveros/shared';
import { buildActivities, expandOccurrences, localToInstant, taskDedupeKey } from '../../src/modules/recovery-plans/engine';
import { dischargeContent } from '../helpers';

const content = dischargeContentSchema.parse(dischargeContent({ templateId: '64b7f0f0f0f0f0f0f0f0f0f0' }));

describe('recovery plan engine — activity derivation', () => {
  const acts = buildActivities(content, { startDate: '2026-03-01', defaultCheckInTime: '09:00' });

  it('creates medication activities only for scheduled (non-PRN) approved medications', () => {
    const meds = acts.filter((a) => a.type === 'MEDICATION');
    expect(meds).toHaveLength(1);
    expect(meds[0]!.medicationIndex).toBe(0);
    expect(meds[0]!.title).toContain('Paracetamol 500mg');
    expect(meds[0]!.recurrence.endDate).toBe('2026-03-05'); // 5-day course
  });

  it('creates a check-in activity only when the clinician selected a template', () => {
    expect(acts.filter((a) => a.type === 'CHECK_IN')).toHaveLength(1);
    const none = buildActivities(dischargeContentSchema.parse(dischargeContent()), { startDate: '2026-03-01', defaultCheckInTime: '09:00' });
    expect(none.filter((a) => a.type === 'CHECK_IN')).toHaveLength(0);
  });

  it('never extends beyond the programme duration', () => {
    for (const a of acts) expect(a.recurrence.endDate <= '2026-03-14').toBe(true);
  });
});

describe('recurrence expansion', () => {
  it('expands daily multiple times per day in the patient timezone', () => {
    const occ = expandOccurrences(
      { kind: 'DAILY', timesOfDay: ['08:00', '20:00'], startDate: '2026-03-01', endDate: '2026-03-03' },
      'Africa/Lagos',
      new Date('2026-02-28T00:00:00Z'),
      new Date('2026-03-10T00:00:00Z'),
    );
    expect(occ).toHaveLength(6);
    // 08:00 WAT (UTC+1) = 07:00Z
    expect(occ[0]!.dueAt.toISOString()).toBe('2026-03-01T07:00:00.000Z');
  });

  it('handles weekly and every-n-days recurrences', () => {
    const weekly = expandOccurrences({ kind: 'WEEKLY', timesOfDay: ['10:00'], daysOfWeek: [1, 4], startDate: '2026-03-01', endDate: '2026-03-14' }, 'UTC', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-15T00:00:00Z'));
    expect(weekly.map((o) => o.localDate)).toEqual(['2026-03-02', '2026-03-05', '2026-03-09', '2026-03-12']);
    const every3 = expandOccurrences({ kind: 'EVERY_N_DAYS', intervalDays: 3, timesOfDay: ['10:00'], startDate: '2026-03-01', endDate: '2026-03-10' }, 'UTC', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-15T00:00:00Z'));
    expect(every3.map((o) => o.localDate)).toEqual(['2026-03-01', '2026-03-04', '2026-03-07', '2026-03-10']);
  });

  it('respects the window bounds (no duplicates across adjacent windows)', () => {
    const r = { kind: 'DAILY' as const, timesOfDay: ['09:00'], startDate: '2026-03-01', endDate: '2026-03-10' };
    const a = expandOccurrences(r, 'UTC', new Date('2026-03-01T00:00:00Z'), new Date('2026-03-05T00:00:00Z'));
    const b = expandOccurrences(r, 'UTC', new Date('2026-03-05T00:00:00Z'), new Date('2026-03-11T00:00:00Z'));
    const keys = [...a, ...b].map((o) => taskDedupeKey('plan', 'k', o));
    expect(new Set(keys).size).toBe(10);
  });

  it('handles DST spring-forward gaps and fall-back overlaps (one task per local slot)', () => {
    // US DST starts 2026-03-08 02:00 → 03:00; 02:30 does not exist.
    const gap = localToInstant('2026-03-08', '02:30', 'America/New_York');
    expect(gap.toISOString()).toBe('2026-03-08T07:30:00.000Z'); // shifted forward to 03:30 EDT
    // Fall back 2026-11-01 01:30 occurs twice; we take one instant.
    const occ = expandOccurrences({ kind: 'DAILY', timesOfDay: ['01:30'], startDate: '2026-10-31', endDate: '2026-11-02' }, 'America/New_York', new Date('2026-10-30T00:00:00Z'), new Date('2026-11-05T00:00:00Z'));
    expect(occ).toHaveLength(3);
    expect(new Set(occ.map((o) => o.localDate)).size).toBe(3);
  });

  it('ONCE recurrences produce exactly one occurrence', () => {
    const occ = expandOccurrences({ kind: 'ONCE', timesOfDay: ['10:00'], startDate: '2026-03-03', endDate: '2026-03-03' }, 'UTC', new Date('2026-03-01T00:00:00Z'), new Date('2026-04-01T00:00:00Z'));
    expect(occ).toHaveLength(1);
  });
});
