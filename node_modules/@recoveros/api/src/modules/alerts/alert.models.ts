import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ALERT_ACTION_TYPES, ALERT_PRIORITIES, ALERT_RULE_STATUSES, ALERT_SOURCES, ALERT_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

const conditionSubSchema = new Schema(
  { field: { type: String, required: true }, op: { type: String, required: true }, value: Schema.Types.Mixed },
  { _id: false },
);

/**
 * AlertRule — a hospital-configured, clinically approved escalation rule.
 * RecoverOS ships NO clinical thresholds; every rule must be authored by the hospital
 * and approved by a user holding `alerts.rules.approve` before it can fire.
 */
const alertRuleSchema = createSchema(
  {
    ...tenantField,
    name: { type: String, required: true },
    description: { type: String, required: true },
    source: { type: String, enum: ALERT_SOURCES, required: true, index: true },
    checkInTemplateId: ref('CheckInTemplate'),
    conditions: {
      all: { type: [conditionSubSchema], default: [] },
      any: { type: [conditionSubSchema], default: [] },
    },
    priority: { type: String, enum: ALERT_PRIORITIES, required: true },
    title: { type: String, required: true },
    patientSafetyMessage: String,
    showEmergencyGuidance: { type: Boolean, default: false },
    routing: {
      careTeamRoles: { type: [String], required: true },
      acknowledgeWithinMinutes: { type: Number, required: true },
      escalateToRoles: { type: [String], required: true },
      maxEscalationLevel: { type: Number, default: 2 },
    },
    evidenceReference: String,
    status: { type: String, enum: ALERT_RULE_STATUSES, default: 'DRAFT', index: true },
    version: { type: Number, default: 1 },
    createdBy: ref('User'),
    submittedBy: ref('User'),
    clinicalApproval: { approvedBy: ref('User'), approvedAt: Date, comment: String },
    retiredAt: Date,
    /** Seeded demo rules are flagged so they are never mistaken for validated protocols. */
    isDemoRule: { type: Boolean, default: false },
  },
  { tenant: true },
);
export type AlertRule = InferSchemaType<typeof alertRuleSchema>;
export type AlertRuleDocument = HydratedDocument<AlertRule>;
export const AlertRuleModel = model('AlertRule', alertRuleSchema);

const alertSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    departmentId: ref('Department'),
    ruleId: ref('AlertRule'),
    ruleVersion: Number,
    source: { type: String, enum: ALERT_SOURCES, required: true },
    sourceRef: { kind: String, id: Schema.Types.ObjectId },
    priority: { type: String, enum: ALERT_PRIORITIES, required: true, index: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'GENERATED', index: true },
    title: { type: String, required: true },
    /** Structured, non-free-text summary of what matched (field/op/value). */
    matchedConditions: [{ _id: false, field: String, op: String, expected: Schema.Types.Mixed, actual: Schema.Types.Mixed }],
    summary: String,
    assignedToUserId: { ...ref('User'), index: true },
    assignedAt: Date,
    acknowledgedBy: ref('User'),
    acknowledgedAt: Date,
    escalationLevel: { type: Number, default: 0 },
    acknowledgeDeadline: Date,
    nextEscalationAt: { type: Date, index: true },
    routing: {
      careTeamRoles: [String],
      acknowledgeWithinMinutes: Number,
      escalateToRoles: [String],
      maxEscalationLevel: Number,
    },
    resolution: {
      outcome: String,
      notes: String,
      resolvedBy: ref('User'),
      resolvedAt: Date,
    },
    closedAt: Date,
    closedBy: ref('User'),
    /** Prevents the same source event generating duplicate alerts for the same rule. */
    dedupeKey: { type: String, required: true },
    createdBy: ref('User'),
  },
  { tenant: true },
);
alertSchema.index({ hospitalId: 1, dedupeKey: 1 }, { unique: true });
alertSchema.index({ hospitalId: 1, status: 1, priority: 1, createdAt: -1 });
export type Alert = InferSchemaType<typeof alertSchema>;
export type AlertDocument = HydratedDocument<Alert>;
export const AlertModel = model('Alert', alertSchema);

/** History of who an alert was assigned to (append-only). */
const alertAssignmentSchema = createSchema(
  {
    ...tenantField,
    alertId: { ...ref('Alert', true), index: true },
    userId: ref('User', true),
    assignedBy: ref('User'),
    reason: { type: String, enum: ['INITIAL', 'MANUAL', 'ESCALATION', 'BACKUP'], required: true },
    escalationLevel: Number,
    note: String,
  },
  { tenant: true, appendOnly: true },
);
export const AlertAssignmentModel = model('AlertAssignment', alertAssignmentSchema);

/** Full event history of an alert, incl. patient contact attempts (append-only). */
const alertActionSchema = createSchema(
  {
    ...tenantField,
    alertId: { ...ref('Alert', true), index: true },
    type: { type: String, enum: ALERT_ACTION_TYPES, required: true },
    actorId: ref('User'),
    bySystem: { type: Boolean, default: false },
    notes: String,
    contactOutcome: String,
    fromStatus: String,
    toStatus: String,
  },
  { tenant: true, appendOnly: true },
);
export const AlertActionModel = model('AlertAction', alertActionSchema);
