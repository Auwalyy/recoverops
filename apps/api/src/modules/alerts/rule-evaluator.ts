import type { RuleCondition } from '@recoveros/shared';

/**
 * Safe, declarative rule evaluation (no eval / no code execution). Rules are authored
 * and clinically approved by the hospital; this module only compares facts.
 */
export type Facts = Record<string, unknown>;

export interface MatchedCondition {
  field: string;
  op: string;
  expected: unknown;
  actual: unknown;
}

export function resolveField(facts: Facts, path: string): unknown {
  let cur: unknown = facts;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function evaluateCondition(c: RuleCondition, facts: Facts): boolean {
  const actual = resolveField(facts, c.field);
  const expected = c.value;
  switch (c.op) {
    case 'exists':
      return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null && actual !== '';
    case 'eq':
      return Array.isArray(actual) ? false : actual === expected || (num(actual) !== undefined && num(actual) === num(expected));
    case 'neq':
      return !(actual === expected || (num(actual) !== undefined && num(actual) === num(expected)));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = num(actual);
      const e = num(expected);
      if (a === undefined || e === undefined) return false;
      return c.op === 'gt' ? a > e : c.op === 'gte' ? a >= e : c.op === 'lt' ? a < e : a <= e;
    }
    case 'in':
      return Array.isArray(expected) && (expected as unknown[]).some((e) => e === actual || (num(e) !== undefined && num(e) === num(actual)));
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected as never);
      if (typeof actual === 'string' && typeof expected === 'string') return actual.toLowerCase().includes(expected.toLowerCase());
      return false;
    default:
      return false;
  }
}

/** `all` must all match; if `any` is non-empty at least one must match. Empty rule never matches. */
export function evaluateConditions(conditions: { all?: RuleCondition[]; any?: RuleCondition[] }, facts: Facts): { matched: boolean; details: MatchedCondition[] } {
  const all = conditions.all ?? [];
  const any = conditions.any ?? [];
  if (!all.length && !any.length) return { matched: false, details: [] };
  const details: MatchedCondition[] = [];
  for (const c of all) {
    if (!evaluateCondition(c, facts)) return { matched: false, details: [] };
    details.push({ field: c.field, op: c.op, expected: c.value, actual: resolveField(facts, c.field) });
  }
  if (any.length) {
    const hits = any.filter((c) => evaluateCondition(c, facts));
    if (!hits.length) return { matched: false, details: [] };
    for (const c of hits) details.push({ field: c.field, op: c.op, expected: c.value, actual: resolveField(facts, c.field) });
  }
  return { matched: true, details };
}
