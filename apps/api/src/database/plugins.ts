import { Schema, type Query } from 'mongoose';
import { AppError } from '../utils/errors';

const GUARDED_QUERY_OPS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndReplace',
] as const;

declare module 'mongoose' {
  interface QueryOptions {
    /** Explicit, reviewed opt-out for platform jobs and populate of an already-authorised parent. */
    skipTenantGuard?: boolean;
  }
}

/**
 * Multi-tenant guard (defence in depth).
 *
 * Every hospital-owned collection gets an immutable, indexed `hospitalId`, and every
 * query against it must filter by `hospitalId`. A query that forgets the tenant filter
 * throws instead of silently reading across hospitals. Services obtain the hospitalId
 * from the authenticated principal — never from the client payload.
 */
export function tenantPlugin(schema: Schema): void {
  if (!schema.path('hospitalId')) {
    schema.add({
      hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true, index: true, immutable: true },
    });
  }

  for (const op of GUARDED_QUERY_OPS) {
    schema.pre(op, function (this: Query<unknown, unknown>) {
      if (this.getOptions().skipTenantGuard) return;
      const filter = this.getFilter() as Record<string, unknown>;
      if (filter.hospitalId === undefined || filter.hospitalId === null) {
        throw new AppError(
          'INTERNAL_ERROR',
          `Tenant guard: ${this.model?.modelName ?? 'unknown'}.${op} executed without hospitalId filter`,
        );
      }
    });
  }

  schema.pre('aggregate', function () {
    if ((this.options as { skipTenantGuard?: boolean }).skipTenantGuard) return;
    const first = this.pipeline()[0] as { $match?: Record<string, unknown> } | undefined;
    if (!first?.$match || first.$match.hospitalId === undefined) {
      throw new AppError('INTERNAL_ERROR', 'Tenant guard: aggregation must start with a $match on hospitalId');
    }
  });
}

/**
 * Append-only guard for audit-grade collections (audit logs, approvals, version history,
 * alert actions). Updates and deletes are rejected at the ODM layer; database-level
 * roles should additionally deny update/delete in production (see SECURITY_MODEL.md).
 */
export function appendOnlyPlugin(schema: Schema, opts: { allowFields?: string[] } = {}): void {
  const blocked = ['updateMany', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace'] as const;
  for (const op of blocked) {
    schema.pre(op, function () {
      throw new AppError('IMMUTABLE_RECORD', 'This record is append-only');
    });
  }
  if (!opts.allowFields?.length) {
    schema.pre(['updateOne', 'findOneAndUpdate'], function () {
      throw new AppError('IMMUTABLE_RECORD', 'This record is append-only');
    });
    schema.pre('save', function () {
      if (!this.isNew) throw new AppError('IMMUTABLE_RECORD', 'This record is append-only');
    });
  }
}

/** Standard JSON transform: expose `id`, hide internals and secrets. */
export function toJSONPlugin(schema: Schema): void {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      for (const key of Object.keys(ret)) {
        if (/hash$/i.test(key) || key === 'passwordHash' || key === 'secret') delete ret[key];
      }
      return ret;
    },
  });
}
