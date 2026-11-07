import { Schema, type SchemaDefinition, type SchemaOptions } from 'mongoose';
import { appendOnlyPlugin, tenantPlugin, toJSONPlugin } from './plugins';

export const ObjectId = Schema.Types.ObjectId;

/** Tenant ownership field included explicitly so it appears in inferred types. */
export const tenantField = {
  hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true as const, index: true, immutable: true },
};

export function ref(model: string, required = false) {
  return required
    ? { type: Schema.Types.ObjectId, ref: model, required: true as const }
    : { type: Schema.Types.ObjectId, ref: model };
}

interface CreateSchemaOptions extends SchemaOptions {
  tenant?: boolean;
  appendOnly?: boolean;
}

/**
 * Build a schema with RecoverOS conventions: timestamps, JSON transform, optional
 * tenant guard and append-only enforcement.
 */
export function createSchema<T extends SchemaDefinition>(definition: T, options: CreateSchemaOptions = {}) {
  const { tenant, appendOnly, ...schemaOptions } = options;
  const schema = new Schema(definition, { timestamps: true, ...schemaOptions });
  schema.plugin(toJSONPlugin);
  if (tenant) schema.plugin(tenantPlugin);
  if (appendOnly) schema.plugin(appendOnlyPlugin);
  return schema;
}
