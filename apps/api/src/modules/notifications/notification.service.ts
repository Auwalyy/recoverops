import { Types } from 'mongoose';
import type { NotificationChannel } from '@recoveros/shared';
import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import { enqueue, registerProcessor } from '../../jobs/queue';
import { emitToUsers } from '../../services/realtime';
import { getProviders } from '../../integrations/notifications/providers';
import { SessionModel } from '../auth/auth.models';
import { UserModel } from '../users/user.model';
import { NotificationModel } from './notification.model';
import { TEMPLATES, type TemplateName } from './templates';

export interface NotifyInput {
  /** Omitted for invitations to people who do not have an account yet. */
  userId?: string | Types.ObjectId;
  hospitalId?: string | Types.ObjectId;
  template: TemplateName;
  vars?: Record<string, string | number | undefined>;
  /** Deep-link data (ids only, never clinical text). */
  data?: Record<string, string>;
  channels?: NotificationChannel[];
  /** Stable key; the same key never produces a second notification per channel. */
  idempotencyKey: string;
  /** Explicit destination override (e.g. invitation to an address with no account yet). */
  destination?: { email?: string; phone?: string };
}

/**
 * Create notification records (one per channel) and enqueue delivery. Idempotent per
 * (idempotencyKey, channel). IN_APP is always recorded when a userId exists.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const tpl = TEMPLATES[input.template](input.vars ?? {});
  const channels = new Set<NotificationChannel>(input.channels ?? ['IN_APP', 'PUSH']);

  const user = input.userId ? await UserModel.findById(input.userId).select('email phone') : null;

  for (const channel of channels) {
    let destination: string | undefined;
    if (channel === 'SMS' || channel === 'WHATSAPP') destination = input.destination?.phone ?? user?.phone ?? undefined;
    if (channel === 'EMAIL') destination = input.destination?.email ?? user?.email ?? undefined;
    if (channel === 'IN_APP' && !input.userId) continue;
    if (channel === 'PUSH') {
      if (!input.userId) continue;
      const sessions = await SessionModel.find({
        userId: input.userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
        'device.pushToken': { $exists: true },
      }).select('device.pushToken');
      const tokens = [...new Set(sessions.map((s) => s.device?.pushToken).filter(Boolean))] as string[];
      for (const token of tokens) {
        await createAndEnqueue(input, channel, tpl, token, `${input.idempotencyKey}:PUSH:${token.slice(-12)}`);
      }
      continue;
    }
    if (channel !== 'IN_APP' && !destination) continue;
    await createAndEnqueue(input, channel, tpl, destination, `${input.idempotencyKey}:${channel}`);
  }

  if (input.userId) emitToUsers([String(input.userId)], 'notification:new', { template: input.template, data: input.data ?? {} });
}

async function createAndEnqueue(
  input: NotifyInput,
  channel: NotificationChannel,
  tpl: { title: string; body: string; sensitiveCode?: boolean },
  destination: string | undefined,
  key: string,
): Promise<void> {
  // In-app copies of code-bearing messages must not store the code.
  const body = channel === 'IN_APP' && tpl.sensitiveCode ? 'A one-time code was sent to you.' : tpl.body;
  try {
    const doc = await NotificationModel.create({
      hospitalId: input.hospitalId,
      userId: input.userId || undefined,
      channel,
      template: input.template,
      title: tpl.title,
      body,
      data: input.data,
      destination,
      status: channel === 'IN_APP' ? 'DELIVERED' : 'QUEUED',
      idempotencyKey: key,
      sentAt: channel === 'IN_APP' ? new Date() : undefined,
    });
    if (channel !== 'IN_APP') {
      await enqueue('notifications.deliver', { notificationId: String(doc._id) }, { jobId: `notif:${String(doc._id)}`, attempts: 5 });
    }
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return; // duplicate → already notified
    throw err;
  }
}

/** Job processor: deliver one notification through its channel provider. */
export async function deliverNotification(notificationId: string): Promise<void> {
  const n = await NotificationModel.findById(notificationId).select('+destination');
  if (!n || n.status === 'SENT' || n.status === 'DELIVERED' || n.status === 'READ') return;
  if (n.channel === 'IN_APP') return;
  const provider = getProviders()[n.channel as 'PUSH' | 'SMS' | 'EMAIL' | 'WHATSAPP'];
  n.attempts += 1;
  try {
    if (!n.destination) throw new Error('No destination');
    const result = await provider.send({ to: n.destination, title: n.title, body: n.body, data: n.data as Record<string, unknown> });
    n.status = 'SENT';
    n.sentAt = new Date();
    n.providerMessageId = result.providerMessageId;
    n.lastError = undefined;
    await n.save();
  } catch (err) {
    n.lastError = (err as Error).message.slice(0, 300);
    if (n.attempts >= 5) n.status = 'FAILED';
    await n.save();
    logger.warn({ notificationId, channel: n.channel, attempts: n.attempts }, 'Notification delivery failed');
    if (n.status !== 'FAILED') throw err; // let BullMQ retry with backoff
  }
}

registerProcessor('notifications.deliver', async (data) => {
  await deliverNotification(String(data.notificationId));
});

/** Development helper: surfaces one-time codes in API responses. Never in production. */
export function devExpose<T extends Record<string, unknown>>(payload: T): T | Record<string, never> {
  return !isProduction && env.DEV_EXPOSE_OTP ? payload : {};
}
