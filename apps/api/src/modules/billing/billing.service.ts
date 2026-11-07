import { Types, type ClientSession } from 'mongoose';
import type { Feature } from '@recoveros/shared';
import { AppError, errors } from '../../utils/errors';
import { registerProcessor } from '../../jobs/queue';
import { logger } from '../../config/logger';
import { audit } from '../audit/audit.service';
import { InvoiceModel, SubscriptionModel, SubscriptionPlanModel, UsageRecordModel } from './billing.models';
import { getPaymentProvider } from './payment-provider';

export const DEFAULT_PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    description: 'Core recovery coordination for a single department.',
    priceMonthlyMinor: 150_000_00,
    features: ['MESSAGING', 'DOCUMENTS'],
    limits: { activeEpisodes: 150, staffSeats: 25, aiRequestsPerMonth: 0 },
    trialDays: 30,
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    description: 'Full recovery programme with rehabilitation, analytics and AI assistance.',
    priceMonthlyMinor: 450_000_00,
    features: ['AI_ASSIST', 'REHABILITATION', 'MESSAGING', 'ANALYTICS', 'SMS_NOTIFICATIONS', 'DOCUMENTS'],
    limits: { activeEpisodes: 1000, staffSeats: 150, aiRequestsPerMonth: 20_000 },
    trialDays: 30,
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Multi-site hospitals with WhatsApp and custom limits.',
    priceMonthlyMinor: 1_200_000_00,
    features: ['AI_ASSIST', 'REHABILITATION', 'MESSAGING', 'ANALYTICS', 'SMS_NOTIFICATIONS', 'WHATSAPP', 'DOCUMENTS'],
    limits: { activeEpisodes: 100_000, staffSeats: 5000, aiRequestsPerMonth: 500_000 },
    trialDays: 30,
  },
] as const;

export async function ensureDefaultPlans(): Promise<void> {
  for (const p of DEFAULT_PLANS) {
    await SubscriptionPlanModel.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
  }
}

/** Every new hospital starts on a Professional trial. */
export async function startTrial(hospitalId: Types.ObjectId, session?: ClientSession, planCode = 'PROFESSIONAL') {
  await ensureDefaultPlans();
  const plan = await SubscriptionPlanModel.findOne({ code: planCode });
  if (!plan) throw errors.notFound('Subscription plan');
  const now = new Date();
  const end = new Date(now.getTime() + (plan.trialDays ?? 30) * 24 * 3600 * 1000);
  const [sub] = await SubscriptionModel.create(
    [{ hospitalId, planCode, status: 'TRIALING', trialEndsAt: end, currentPeriodStart: now, currentPeriodEnd: end, history: [{ to: 'TRIALING', at: now, reason: 'Hospital registered' }] }],
    session ? { session } : {},
  );
  return sub!;
}

export async function getEntitlements(hospitalId: string | Types.ObjectId) {
  const sub = await SubscriptionModel.findOne({ hospitalId });
  if (!sub) return { status: 'NONE' as const, features: [] as Feature[], plan: null, subscription: null };
  const plan = await SubscriptionPlanModel.findOne({ code: sub.planCode });
  const active = sub.status === 'ACTIVE' || sub.status === 'TRIALING' || sub.status === 'PAST_DUE';
  return {
    status: sub.status,
    features: active ? ((plan?.features ?? []) as Feature[]) : [],
    plan,
    subscription: sub,
  };
}

/** Throws FEATURE_NOT_ENTITLED when the hospital's plan does not include `feature`. */
export async function assertFeature(hospitalId: string | Types.ObjectId, feature: Feature): Promise<void> {
  const e = await getEntitlements(hospitalId);
  if (!e.features.includes(feature)) {
    throw new AppError('FEATURE_NOT_ENTITLED', `Your hospital's subscription does not include ${feature.replace(/_/g, ' ').toLowerCase()}`);
  }
}

export async function recordUsage(hospitalId: string | Types.ObjectId, metric: 'ACTIVE_EPISODES' | 'AI_REQUESTS' | 'SMS_SENT' | 'STAFF_SEATS', quantity = 1) {
  const period = new Date().toISOString().slice(0, 7);
  await UsageRecordModel.updateOne({ hospitalId, metric, period }, { $inc: { quantity } }, { upsert: true });
}

export async function getUsage(hospitalId: string | Types.ObjectId) {
  const period = new Date().toISOString().slice(0, 7);
  return UsageRecordModel.find({ hospitalId, period }).select('metric quantity period');
}

export async function changePlan(hospitalId: Types.ObjectId, planCode: string, actorId: string) {
  const plan = await SubscriptionPlanModel.findOne({ code: planCode, active: true });
  if (!plan) throw errors.notFound('Subscription plan');
  const sub = await SubscriptionModel.findOne({ hospitalId });
  if (!sub) throw errors.notFound('Subscription');
  const from = sub.planCode;
  sub.planCode = planCode;
  sub.history.push({ from, to: planCode, at: new Date(), reason: 'Plan changed' });
  await sub.save();
  await audit({ action: 'SUBSCRIPTION_PLAN_CHANGED', resourceType: 'Subscription', resourceId: String(sub._id), hospitalId: String(hospitalId), actor: { userId: actorId }, metadata: { from, to: planCode } });
  return sub;
}

/** Issue an invoice for the next period through the configured payment provider. */
export async function issueInvoice(hospitalId: Types.ObjectId) {
  const sub = await SubscriptionModel.findOne({ hospitalId });
  if (!sub) throw errors.notFound('Subscription');
  const plan = await SubscriptionPlanModel.findOne({ code: sub.planCode });
  if (!plan) throw errors.notFound('Subscription plan');
  const count = await InvoiceModel.countDocuments({ hospitalId });
  const number = `RO-${String(hospitalId).slice(-6).toUpperCase()}-${String(count + 1).padStart(5, '0')}`;
  const invoice = await InvoiceModel.create({
    hospitalId,
    subscriptionId: sub._id,
    number,
    currency: plan.currency,
    amountMinor: plan.priceMonthlyMinor,
    lineItems: [{ description: `${plan.name} plan — monthly`, quantity: 1, unitAmountMinor: plan.priceMonthlyMinor }],
    periodStart: sub.currentPeriodEnd,
    periodEnd: new Date(sub.currentPeriodEnd.getTime() + 30 * 24 * 3600 * 1000),
    status: 'OPEN',
    dueAt: new Date(sub.currentPeriodEnd.getTime() + 7 * 24 * 3600 * 1000),
  });
  const provider = getPaymentProvider();
  const checkout = await provider.createPaymentLink({ invoiceNumber: number, amountMinor: invoice.amountMinor, currency: invoice.currency });
  invoice.paymentProvider = provider.name;
  invoice.providerRef = checkout.reference;
  invoice.paymentUrl = checkout.url;
  await invoice.save();
  return invoice;
}

export async function markInvoicePaid(hospitalId: Types.ObjectId, invoiceId: string, providerRef: string | undefined, actorId: string) {
  const invoice = await InvoiceModel.findOne({ _id: invoiceId, hospitalId });
  if (!invoice) throw errors.notFound('Invoice');
  if (invoice.status === 'PAID') return invoice;
  const provider = getPaymentProvider();
  const verified = await provider.verifyPayment(providerRef ?? invoice.providerRef ?? '');
  if (!verified) throw new AppError('VALIDATION_ERROR', 'Payment could not be verified with the payment provider');
  invoice.status = 'PAID';
  invoice.paidAt = new Date();
  await invoice.save();
  const sub = await SubscriptionModel.findOne({ hospitalId });
  if (sub) {
    const from = sub.status;
    sub.status = 'ACTIVE';
    sub.currentPeriodStart = invoice.periodStart ?? new Date();
    sub.currentPeriodEnd = invoice.periodEnd ?? new Date(Date.now() + 30 * 24 * 3600 * 1000);
    sub.history.push({ from, to: 'ACTIVE', at: new Date(), reason: `Invoice ${invoice.number} paid` });
    await sub.save();
  }
  await audit({ action: 'INVOICE_PAID', resourceType: 'Invoice', resourceId: String(invoice._id), hospitalId: String(hospitalId), actor: { userId: actorId } });
  return invoice;
}

/** Daily lifecycle: trial expiry, renewal invoices, past-due → expired. */
export async function runSubscriptionLifecycle(now = new Date()): Promise<void> {
  const subs = await SubscriptionModel.find({ status: { $in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { $lte: now } }).setOptions({ skipTenantGuard: true });
  for (const sub of subs) {
    const from = sub.status;
    if (sub.status === 'PAST_DUE') {
      if (sub.currentPeriodEnd.getTime() + 14 * 24 * 3600 * 1000 < now.getTime()) sub.status = 'EXPIRED';
    } else if (sub.autoRenew) {
      sub.status = 'PAST_DUE';
      await issueInvoice(sub.hospitalId).catch((err) => logger.error({ err, hospitalId: String(sub.hospitalId) }, 'Invoice issue failed'));
    } else {
      sub.status = 'EXPIRED';
    }
    if (from !== sub.status) {
      sub.history.push({ from, to: sub.status, at: now, reason: 'Lifecycle' });
      await sub.save();
    }
  }
}

registerProcessor('subscriptions.lifecycle', async () => runSubscriptionLifecycle());
