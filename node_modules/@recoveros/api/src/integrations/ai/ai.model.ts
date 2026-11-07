import { model, Schema, type InferSchemaType } from 'mongoose';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * AiInteraction — provenance log for every AI call: model, prompt version, timing,
 * validation outcome and the validated output. Inputs are stored only as a hash
 * (the source data already lives in its own collection).
 */
const aiInteractionSchema = createSchema(
  {
    ...tenantField,
    feature: { type: String, enum: ['EXPLAIN_INSTRUCTION', 'CLASSIFY_MESSAGE', 'SUMMARISE_RECOVERY', 'PATTERN_INSIGHTS', 'TRANSCRIBE'], required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    requestedBy: ref('User'),
    patientId: { ...ref('Patient'), index: true },
    episodeId: ref('RecoveryEpisode'),
    sourceRef: { kind: String, id: Schema.Types.ObjectId, index: Number },
    inputHash: String,
    status: { type: String, enum: ['SUCCEEDED', 'INVALID_OUTPUT', 'FAILED', 'FALLBACK', 'REJECTED_SAFETY'], required: true },
    latencyMs: Number,
    output: { type: Schema.Types.Mixed },
    errorCode: String,
    /** Human review/correction of AI output (e.g. corrected transcription). */
    review: { reviewedBy: ref('User'), reviewedAt: Date, correctedOutput: Schema.Types.Mixed, accepted: Boolean },
  },
  { tenant: true },
);
aiInteractionSchema.index({ hospitalId: 1, feature: 1, createdAt: -1 });
export type AiInteraction = InferSchemaType<typeof aiInteractionSchema>;
export const AiInteractionModel = model('AiInteraction', aiInteractionSchema);
