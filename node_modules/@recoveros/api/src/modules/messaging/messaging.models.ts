import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CONVERSATION_TYPES, MESSAGE_CATEGORIES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** A conversation is always bound to an authorised patient relationship (or is staff-only). */
const conversationSchema = createSchema(
  {
    ...tenantField,
    type: { type: String, enum: CONVERSATION_TYPES, required: true },
    patientId: { ...ref('Patient'), index: true },
    episodeId: ref('RecoveryEpisode'),
    subject: { type: String, required: true },
    category: { type: String, enum: MESSAGE_CATEGORIES, default: 'GENERAL' },
    participantUserIds: { type: [Schema.Types.ObjectId], ref: 'User', index: true },
    assignedToUserId: { ...ref('User'), index: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    escalated: { type: Boolean, default: false },
    escalatedAlertId: ref('Alert'),
    callbackRequested: { type: Boolean, default: false },
    lastMessageAt: Date,
    lastMessagePreview: String,
    createdBy: ref('User'),
  },
  { tenant: true },
);
conversationSchema.index({ hospitalId: 1, lastMessageAt: -1 });
export type Conversation = InferSchemaType<typeof conversationSchema>;
export type ConversationDocument = HydratedDocument<Conversation>;
export const ConversationModel = model('Conversation', conversationSchema);

const messageSchema = createSchema(
  {
    ...tenantField,
    conversationId: { ...ref('Conversation', true), index: true },
    senderId: ref('User', true),
    senderKind: { type: String, enum: ['STAFF', 'PATIENT', 'CAREGIVER', 'SYSTEM'], required: true },
    type: { type: String, enum: ['TEXT', 'CALLBACK_REQUEST', 'SYSTEM'], default: 'TEXT' },
    body: { type: String, required: true },
    attachmentIds: [ref('Document')],
    readBy: [{ _id: false, userId: ref('User'), at: Date }],
    idempotencyKey: String,
    aiClassificationId: ref('AiInteraction'),
  },
  { tenant: true },
);
messageSchema.index({ hospitalId: 1, conversationId: 1, createdAt: 1 });
messageSchema.index(
  { hospitalId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
export type Message = InferSchemaType<typeof messageSchema>;
export const MessageModel = model('Message', messageSchema);
