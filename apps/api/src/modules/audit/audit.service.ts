import type { ClientSession } from 'mongoose';
import { getContext } from '../../middleware/context';
import { logger } from '../../config/logger';
import { AuditLogModel } from './audit.model';
import type { Principal } from '../access/principal';

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | { toString(): string };
  patientId?: string | { toString(): string };
  hospitalId?: string | { toString(): string };
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILURE';
  justification?: string;
  breakGlass?: boolean;
  /** Structured change metadata only — never passwords, tokens or clinical free text. */
  metadata?: Record<string, unknown>;
  /** Explicit actor (e.g. during login, before a principal exists). */
  actor?: { userId?: string; kind?: string; roles?: string[] };
  principal?: Principal;
}

const FORBIDDEN_METADATA_KEYS = /password|token|secret|otp|code$|authorization/i;

function sanitise(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_METADATA_KEYS.test(k)) continue;
    out[k] = typeof v === 'string' && v.length > 500 ? `${v.slice(0, 500)}…` : v;
  }
  return out;
}

/**
 * Record an audit event. Audit failures are logged loudly but never block the
 * (already-committed) business action; pass `session` to make the audit record part
 * of the same transaction when atomicity matters.
 */
export async function audit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  const ctx = getContext();
  const p = entry.principal ?? ctx?.principal;
  try {
    await AuditLogModel.create(
      [
        {
          hospitalId: entry.hospitalId ?? p?.hospitalId,
          actorId: entry.actor?.userId ?? p?.userId,
          actorKind: entry.actor?.kind ?? p?.kind ?? 'ANONYMOUS',
          actorRoles: entry.actor?.roles ?? p?.roles ?? [],
          patientId: entry.patientId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId ? String(entry.resourceId) : undefined,
          outcome: entry.outcome ?? 'SUCCESS',
          requestId: ctx?.requestId,
          ip: ctx?.ip,
          userAgent: ctx?.userAgent,
          justification: entry.justification,
          breakGlass: entry.breakGlass ?? false,
          metadata: sanitise(entry.metadata),
        },
      ],
      session ? { session } : {},
    );
  } catch (err) {
    if (session) throw err;
    logger.error({ err, action: entry.action }, 'AUDIT WRITE FAILED');
  }
}
