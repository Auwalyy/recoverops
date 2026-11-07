import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from '@recoveros/shared';
import { createSchema, ref } from '../../database/schema';

/**
 * Notification delivery record. `title`/`body` are deliberately generic for external
 * channels (SMS/push previews must never contain clinical detail); in-app notifications
 * may deep-link to the authorised screen where details are shown after authentication.
 */
const notificationSchema = createSchema({
  hospitalId: { ...ref('Hospital'), index: true },
  userId: { ...ref('User'), index: true },
  channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
  template: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  destination: { type: String, select: false },
  status: { type: String, enum: NOTIFICATION_STATUSES, default: 'QUEUED', index: true },
  attempts: { type: Number, default: 0 },
  lastError: String,
  providerMessageId: String,
  sentAt: Date,
  readAt: Date,
  idempotencyKey: { type: String, required: true, unique: true },
  scheduledFor: Date,
});
notificationSchema.index({ userId: 1, channel: 1, createdAt: -1 });
export type Notification = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationModel = model('Notification', notificationSchema);
