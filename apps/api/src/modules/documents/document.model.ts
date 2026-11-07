import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DOCUMENT_TYPES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** Metadata for a privately stored file. Binary content lives in private object storage. */
const documentSchema = createSchema(
  {
    ...tenantField,
    patientId: { ...ref('Patient'), index: true },
    episodeId: { ...ref('RecoveryEpisode'), index: true },
    type: { type: String, enum: DOCUMENT_TYPES, required: true },
    title: { type: String, required: true },
    storageKey: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sha256: { type: String, required: true },
    visibility: { type: String, enum: ['STAFF_ONLY', 'PATIENT_VISIBLE'], default: 'STAFF_ONLY' },
    uploadedBy: ref('User', true),
    uploaderKind: { type: String, enum: ['STAFF', 'PATIENT', 'CAREGIVER'], required: true },
    status: { type: String, enum: ['ACTIVE', 'DELETED'], default: 'ACTIVE' },
    deletedAt: Date,
    deletedBy: ref('User'),
  },
  { tenant: true },
);
export type DocumentRecord = InferSchemaType<typeof documentSchema>;
export type DocumentRecordDocument = HydratedDocument<DocumentRecord>;
export const DocumentModel = model('Document', documentSchema);
