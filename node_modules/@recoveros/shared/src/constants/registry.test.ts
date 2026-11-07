import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, CLINICAL_PERMISSIONS, isPermission } from './permissions';
import { PLATFORM_ROLES, ROLE_DEFINITIONS, ROLES } from './roles';
import { ALERT_TRANSITIONS, ALERT_STATUSES, EPISODE_STATUSES, EPISODE_TRANSITIONS, CAREGIVER_SCOPES, canTransition } from './domain';

describe('permission registry', () => {
  it('every role only references registered permissions', () => {
    for (const role of ROLES) {
      for (const p of ROLE_DEFINITIONS[role].permissions) expect(isPermission(p)).toBe(true);
    }
  });

  it('platform roles never hold clinical permissions', () => {
    for (const role of PLATFORM_ROLES) {
      for (const p of CLINICAL_PERMISSIONS) expect(ROLE_DEFINITIONS[role].permissions).not.toContain(p);
    }
  });

  it('physiotherapists cannot read medication or check-ins', () => {
    const perms = ROLE_DEFINITIONS.PHYSIOTHERAPIST.permissions;
    expect(perms).not.toContain('medication.read');
    expect(perms).not.toContain('checkins.read');
    expect(ROLE_DEFINITIONS.PHYSIOTHERAPIST.accessScope).toBe('ASSIGNED');
  });

  it('patients and caregivers cannot approve or manage clinical content', () => {
    for (const role of ['PATIENT', 'CAREGIVER'] as const) {
      const perms = ROLE_DEFINITIONS[role].permissions;
      for (const p of ['discharge.approve', 'medication.manage', 'recovery.approve', 'alerts.resolve'] as const) {
        expect(perms).not.toContain(p);
      }
    }
  });

  it('caregiver scopes map only to permissions within the caregiver role ceiling', () => {
    const ceiling = ROLE_DEFINITIONS.CAREGIVER.permissions;
    for (const perms of Object.values(CAREGIVER_SCOPES)) for (const p of perms) expect(ceiling).toContain(p);
  });

  it('has no duplicate permissions', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

describe('state machines', () => {
  it('episode transitions reference known statuses and terminal states are final', () => {
    for (const s of EPISODE_STATUSES) for (const t of EPISODE_TRANSITIONS[s]) expect(EPISODE_STATUSES).toContain(t);
    expect(EPISODE_TRANSITIONS.COMPLETED).toHaveLength(0);
    expect(canTransition(EPISODE_TRANSITIONS, 'DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransition(EPISODE_TRANSITIONS, 'ACTIVE', 'COMPLETED')).toBe(true);
  });

  it('alerts cannot be closed without being resolved', () => {
    for (const s of ALERT_STATUSES) {
      if (s !== 'RESOLVED') expect(ALERT_TRANSITIONS[s]).not.toContain('CLOSED');
    }
    expect(ALERT_TRANSITIONS.GENERATED).not.toContain('RESOLVED');
  });
});
