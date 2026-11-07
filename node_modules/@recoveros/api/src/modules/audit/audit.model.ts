import { model, type InferSchemaType } from 'mongoose';
import { createSchema, ref } from '../../database/schema';

/**
 * Immutable audit trail. hospitalId is optional because platform-level events
 * (e.g. hospital verification, failed logins for unknown accounts) have no tenant.
 * NEVER store passwords, tokens or clinical free text in `metadata`.
 */
const auditLogSchema = createSchema(
  {
    hospitalId: { ...ref('Hospital'), index: true },
    actorId: { ...ref('User'), index: true },
    actorRoles: [String],
    actorKind: { type: String, enum: ['PLATFORM', 'STAFF', 'PATIENT', 'CAREGIVER', 'SYSTEM', 'ANONYMOUS'] },
    patientId: { ...ref('Patient'), index: true },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: String,
    outcome: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILURE'], default: 'SUCCESS' },
    requestId: String,
    ip: String,
    userAgent: String,
    justification: String,
    breakGlass: { type: Boolean, default: false },
    metadata: { type: Object },
  },
  { appendOnly: true, timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ hospitalId: 1, createdAt: -1 });
auditLogSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
