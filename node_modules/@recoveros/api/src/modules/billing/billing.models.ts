import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { FEATURES, INVOICE_STATUSES, SUBSCRIPTION_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** Platform-level catalogue (not tenant-owned). Prices in minor units (kobo for NGN). */
const subscriptionPlanSchema = createSchema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  currency: { type: String, default: 'NGN' },
  priceMonthlyMinor: { type: Number, required: true },
  features: { type: [String], enum: FEATURES, default: [] },
  limits: { activeEpisodes: Number, staffSeats: Number, aiRequestsPerMonth: Number },
  trialDays: { type: Number, default: 30 },
  active: { type: Boolean, default: true },
});
export type SubscriptionPlan = InferSchemaType<typeof subscriptionPlanSchema>;
export const SubscriptionPlanModel = model('SubscriptionPlan', subscriptionPlanSchema);

const subscriptionSchema = createSchema(
  {
    // One subscription per hospital (unique tenant index).
    hospitalId: { ...tenantField.hospitalId, unique: true },
    planCode: { type: String, required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, required: true, index: true },
    trialEndsAt: Date,
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    autoRenew: { type: Boolean, default: true },
    cancelledAt: Date,
    paymentProvider: String,
    providerCustomerRef: String,
    history: [{ _id: false, from: String, to: String, at: Date, reason: String }],
  },
  { tenant: true },
);
export type Subscription = InferSchemaType<typeof subscriptionSchema>;
export type SubscriptionDocument = HydratedDocument<Subscription>;
export const SubscriptionModel = model('Subscription', subscriptionSchema);

const usageRecordSchema = createSchema(
  {
    ...tenantField,
    metric: { type: String, enum: ['ACTIVE_EPISODES', 'AI_REQUESTS', 'SMS_SENT', 'STAFF_SEATS'], required: true },
    period: { type: String, required: true }, // YYYY-MM
    quantity: { type: Number, default: 0 },
  },
  { tenant: true },
);
usageRecordSchema.index({ hospitalId: 1, metric: 1, period: 1 }, { unique: true });
export const UsageRecordModel = model('UsageRecord', usageRecordSchema);

const invoiceSchema = createSchema(
  {
    ...tenantField,
    subscriptionId: ref('Subscription', true),
    number: { type: String, required: true, unique: true },
    currency: { type: String, default: 'NGN' },
    amountMinor: { type: Number, required: true },
    lineItems: [{ _id: false, description: String, quantity: Number, unitAmountMinor: Number }],
    periodStart: Date,
    periodEnd: Date,
    status: { type: String, enum: INVOICE_STATUSES, default: 'OPEN', index: true },
    dueAt: { type: Date, required: true },
    paidAt: Date,
    paymentProvider: String,
    providerRef: String,
    paymentUrl: String,
  },
  { tenant: true },
);
export type Invoice = InferSchemaType<typeof invoiceSchema>;
export const InvoiceModel = model('Invoice', invoiceSchema);
