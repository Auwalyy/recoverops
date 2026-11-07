/**
 * RecoverOS permission registry.
 *
 * This is the single source of truth for every permission the platform knows about.
 * Roles are mapped to permissions in `roles.ts`; the backend NEVER authorises on a
 * role name alone — it always resolves the principal's permission set and then applies
 * record-level (tenant, department, care-team, consent) checks on top.
 */
export declare const PERMISSIONS: {
    readonly 'patients.read': "View patient recovery-coordination profiles";
    readonly 'patients.create': "Register patients for recovery coordination";
    readonly 'patients.update': "Update patient profile and contact details";
    readonly 'patients.assign': "Assign care-team members to patients and episodes";
    readonly 'recovery.read': "View recovery episodes, plans and tasks";
    readonly 'recovery.create': "Create recovery episodes";
    readonly 'recovery.update': "Update recovery episodes and non-clinical task details";
    readonly 'recovery.approve': "Approve recovery plan changes and complete/extend/transfer recovery programmes";
    readonly 'discharge.create': "Draft discharge plans";
    readonly 'discharge.review': "Review discharge plans and record patient understanding";
    readonly 'discharge.approve': "Approve discharge plans (authorised clinicians only)";
    readonly 'medication.read': "View approved medication orders and patient-reported dose events";
    readonly 'medication.manage': "Manage medication orders within an approved discharge plan";
    readonly 'medication.review': "Review medication concerns (pharmacist review)";
    readonly 'checkins.read': "View patient check-ins and symptom reports";
    readonly 'checkins.create': "Submit check-ins and symptom reports";
    readonly 'checkins.templates.manage': "Create and approve check-in templates";
    readonly 'alerts.read': "View clinical alerts";
    readonly 'alerts.acknowledge': "Acknowledge clinical alerts";
    readonly 'alerts.assign': "Assign and reassign clinical alerts";
    readonly 'alerts.resolve': "Record actions on and resolve clinical alerts";
    readonly 'alerts.rules.manage': "Draft alert/escalation rules";
    readonly 'alerts.rules.approve': "Clinically approve alert/escalation rules";
    readonly 'appointments.read': "View appointments";
    readonly 'appointments.manage': "Create, reschedule and record attendance for appointments";
    readonly 'rehabilitation.read': "View rehabilitation plans and sessions";
    readonly 'rehabilitation.manage': "Manage rehabilitation plans, sessions and assessments";
    readonly 'messages.read': "Read patient/care-team conversations";
    readonly 'messages.send': "Send messages in authorised conversations";
    readonly 'documents.read': "View recovery documents";
    readonly 'documents.manage': "Upload and manage recovery documents";
    readonly 'reports.read': "View hospital analytics and reports";
    readonly 'users.manage': "Invite, suspend and manage hospital staff";
    readonly 'hospital.settings.manage': "Manage hospital profile, departments and configuration";
    readonly 'audit.read': "View audit trails";
    readonly 'billing.manage': "View and manage hospital subscription and invoices";
    readonly 'ai.use': "Use AI-assisted features";
    readonly 'platform.hospitals.manage': "Onboard, verify and suspend hospitals";
    readonly 'platform.subscriptions.manage': "Manage subscription plans and hospital subscriptions";
    readonly 'platform.support.read': "View non-clinical operational metadata for support";
};
export type Permission = keyof typeof PERMISSIONS;
export declare const ALL_PERMISSIONS: Permission[];
/**
 * Permissions that grant access to clinical/patient information. Used to make sure
 * platform roles can never receive them and to flag sensitive access in audit logs.
 */
export declare const CLINICAL_PERMISSIONS: readonly Permission[];
export declare function isPermission(value: string): value is Permission;
