import {
  Schema,
  type ApplySchemaOptions,
  type Model,
  type ObtainDocumentType,
  type ResolveSchemaOptions,
  type SchemaDefinition,
  type SchemaOptions,
} from 'mongoose';
import { appendOnlyPlugin, tenantPlugin, toJSONPlugin } from './plugins';

export const ObjectId = Schema.Types.ObjectId;

/** Tenant ownership field included explicitly so it appears in inferred types. */
export const tenantField = {
  hospitalId: { type: Schema.Types.ObjectId, ref: 'Hospital', required: true as const, index: true, immutable: true },
};

export function ref(model: string, required: true): { type: typeof Schema.Types.ObjectId; ref: string; required: true };
export function ref(model: string, required?: false): { type: typeof Schema.Types.ObjectId; ref: string };
export function ref(model: string, required = false) {
  return required ? { type: Schema.Types.ObjectId, ref: model, required: true as const } : { type: Schema.Types.ObjectId, ref: model };
}

interface CreateSchemaOptions extends SchemaOptions {
  tenant?: boolean;
  appendOnly?: boolean;
}

type TimestampOptions = { timestamps: true };
/** Document type inferred from a schema definition literal (same inference `new Schema(def)` uses). */
export type DocFromDefinition<T> = ApplySchemaOptions<
  ObtainDocumentType<T, any, ResolveSchemaOptions<TimestampOptions>>,
  ResolveSchemaOptions<TimestampOptions>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// @ts-ignore -- D is exactly what Mongoose infers for the definition; the generic constraint is self-referential.
export type TypedSchema<D> = Schema<D, Model<D>, {}, {}, {}, {}, TimestampOptions, D>;

/**
 * Build a schema with RecoverOS conventions: timestamps, JSON transform, optional
 * tenant guard and append-only enforcement. The explicit return type preserves
 * Mongoose's document-type inference through this helper.
 */
export function createSchema<T extends SchemaDefinition>(
  definition: T,
  options: CreateSchemaOptions = {},
): TypedSchema<DocFromDefinition<T>> {
  const { tenant, appendOnly, ...schemaOptions } = options;
  const schema = new Schema(definition, { timestamps: true, ...schemaOptions });
  schema.plugin(toJSONPlugin);
  if (tenant) schema.plugin(tenantPlugin);
  if (appendOnly) schema.plugin(appendOnlyPlugin);
  return schema as unknown as TypedSchema<DocFromDefinition<T>>;
}
