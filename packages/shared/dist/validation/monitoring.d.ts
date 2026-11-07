import { z } from 'zod';
export declare const questionSchema: z.ZodObject<{
    key: z.ZodString;
    type: z.ZodEnum<{
        SCALE: "SCALE";
        BOOLEAN: "BOOLEAN";
        SINGLE_CHOICE: "SINGLE_CHOICE";
        MULTI_CHOICE: "MULTI_CHOICE";
        TEXT: "TEXT";
        NUMBER: "NUMBER";
    }>;
    label: z.ZodString;
    helpText: z.ZodOptional<z.ZodString>;
    required: z.ZodDefault<z.ZodBoolean>;
    options: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>>;
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
    translations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        label: z.ZodString;
        helpText: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type CheckInQuestion = z.infer<typeof questionSchema>;
export declare const createCheckInTemplateSchema: z.ZodObject<{
    name: z.ZodString;
    kind: z.ZodEnum<{
        MEDICATION: "MEDICATION";
        GENERAL: "GENERAL";
        PAIN: "PAIN";
        MOBILITY: "MOBILITY";
        WOUND: "WOUND";
        WELLBEING: "WELLBEING";
        CONDITION_SPECIFIC: "CONDITION_SPECIFIC";
    }>;
    description: z.ZodOptional<z.ZodString>;
    questions: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        type: z.ZodEnum<{
            SCALE: "SCALE";
            BOOLEAN: "BOOLEAN";
            SINGLE_CHOICE: "SINGLE_CHOICE";
            MULTI_CHOICE: "MULTI_CHOICE";
            TEXT: "TEXT";
            NUMBER: "NUMBER";
        }>;
        label: z.ZodString;
        helpText: z.ZodOptional<z.ZodString>;
        required: z.ZodDefault<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodObject<{
            value: z.ZodString;
            label: z.ZodString;
        }, z.core.$strip>>>;
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        translations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            label: z.ZodString;
            helpText: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const answerValue: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodString>]>;
export declare const submitCheckInSchema: z.ZodObject<{
    episodeId: z.ZodString;
    templateId: z.ZodString;
    taskId: z.ZodOptional<z.ZodString>;
    answers: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodString>]>>;
    notes: z.ZodOptional<z.ZodString>;
    attachmentIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    idempotencyKey: z.ZodString;
    clientSubmittedAt: z.ZodOptional<z.ZodISODateTime>;
}, z.core.$strip>;
export type SubmitCheckInInput = z.infer<typeof submitCheckInSchema>;
export declare const submitSymptomSchema: z.ZodObject<{
    episodeId: z.ZodString;
    symptomCode: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    severity: z.ZodEnum<{
        MILD: "MILD";
        MODERATE: "MODERATE";
        SEVERE: "SEVERE";
    }>;
    onsetAt: z.ZodOptional<z.ZodISODateTime>;
    durationText: z.ZodOptional<z.ZodString>;
    trend: z.ZodEnum<{
        IMPROVING: "IMPROVING";
        UNCHANGED: "UNCHANGED";
        WORSENING: "WORSENING";
        NEW: "NEW";
    }>;
    attachmentIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    notes: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodString;
}, z.core.$strip>;
export type SubmitSymptomInput = z.infer<typeof submitSymptomSchema>;
export declare const reviewSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const medicationEventSchema: z.ZodObject<{
    medicationOrderId: z.ZodString;
    taskId: z.ZodOptional<z.ZodString>;
    scheduledFor: z.ZodOptional<z.ZodISODateTime>;
    status: z.ZodEnum<{
        REPORTED_TAKEN: "REPORTED_TAKEN";
        REPORTED_MISSED: "REPORTED_MISSED";
        REPORTED_DELAYED: "REPORTED_DELAYED";
        UNABLE_TO_OBTAIN: "UNABLE_TO_OBTAIN";
    }>;
    reportedTakenAt: z.ZodOptional<z.ZodISODateTime>;
    reason: z.ZodOptional<z.ZodString>;
    sideEffects: z.ZodOptional<z.ZodString>;
    accessProblem: z.ZodOptional<z.ZodEnum<{
        OTHER: "OTHER";
        COST: "COST";
        OUT_OF_STOCK: "OUT_OF_STOCK";
        PHARMACY_ACCESS: "PHARMACY_ACCESS";
        LOST: "LOST";
    }>>;
    requestPharmacistReview: z.ZodDefault<z.ZodBoolean>;
    idempotencyKey: z.ZodString;
}, z.core.$strip>;
export type MedicationEventInput = z.infer<typeof medicationEventSchema>;
export declare const ruleConditionSchema: z.ZodObject<{
    field: z.ZodString;
    op: z.ZodEnum<{
        eq: "eq";
        neq: "neq";
        gt: "gt";
        gte: "gte";
        lt: "lt";
        lte: "lte";
        in: "in";
        contains: "contains";
        exists: "exists";
    }>;
    value: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>]>>;
}, z.core.$strip>;
export type RuleCondition = z.infer<typeof ruleConditionSchema>;
export declare const createAlertRuleSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    source: z.ZodEnum<{
        CHECK_IN: "CHECK_IN";
        SYMPTOM_REPORT: "SYMPTOM_REPORT";
        MEDICATION_EVENT: "MEDICATION_EVENT";
        TASK_MISSED: "TASK_MISSED";
        APPOINTMENT_MISSED: "APPOINTMENT_MISSED";
        MESSAGE: "MESSAGE";
    }>;
    conditions: z.ZodObject<{
        all: z.ZodDefault<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            op: z.ZodEnum<{
                eq: "eq";
                neq: "neq";
                gt: "gt";
                gte: "gte";
                lt: "lt";
                lte: "lte";
                in: "in";
                contains: "contains";
                exists: "exists";
            }>;
            value: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>]>>;
        }, z.core.$strip>>>;
        any: z.ZodDefault<z.ZodArray<z.ZodObject<{
            field: z.ZodString;
            op: z.ZodEnum<{
                eq: "eq";
                neq: "neq";
                gt: "gt";
                gte: "gte";
                lt: "lt";
                lte: "lte";
                in: "in";
                contains: "contains";
                exists: "exists";
            }>;
            value: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>]>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
    checkInTemplateId: z.ZodOptional<z.ZodString>;
    priority: z.ZodEnum<{
        LOW: "LOW";
        MEDIUM: "MEDIUM";
        HIGH: "HIGH";
        CRITICAL: "CRITICAL";
    }>;
    title: z.ZodString;
    patientSafetyMessage: z.ZodOptional<z.ZodString>;
    showEmergencyGuidance: z.ZodDefault<z.ZodBoolean>;
    routing: z.ZodObject<{
        careTeamRoles: z.ZodArray<z.ZodEnum<{
            DOCTOR: "DOCTOR";
            DISCHARGE_NURSE: "DISCHARGE_NURSE";
            RECOVERY_NURSE: "RECOVERY_NURSE";
            RECOVERY_COORDINATOR: "RECOVERY_COORDINATOR";
            PHARMACIST: "PHARMACIST";
            PHYSIOTHERAPIST: "PHYSIOTHERAPIST";
            RESPONSIBLE_DOCTOR: "RESPONSIBLE_DOCTOR";
        }>>;
        acknowledgeWithinMinutes: z.ZodNumber;
        escalateToRoles: z.ZodArray<z.ZodEnum<{
            PLATFORM_SUPER_ADMIN: "PLATFORM_SUPER_ADMIN";
            PLATFORM_SUPPORT: "PLATFORM_SUPPORT";
            HOSPITAL_ADMIN: "HOSPITAL_ADMIN";
            MEDICAL_DIRECTOR: "MEDICAL_DIRECTOR";
            DOCTOR: "DOCTOR";
            DISCHARGE_NURSE: "DISCHARGE_NURSE";
            RECOVERY_NURSE: "RECOVERY_NURSE";
            RECOVERY_COORDINATOR: "RECOVERY_COORDINATOR";
            PHARMACIST: "PHARMACIST";
            PHYSIOTHERAPIST: "PHYSIOTHERAPIST";
            QUALITY_OFFICER: "QUALITY_OFFICER";
            PATIENT: "PATIENT";
            CAREGIVER: "CAREGIVER";
        }>>;
        maxEscalationLevel: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    evidenceReference: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
export declare const alertListQuery: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<{
        ASSIGNED: "ASSIGNED";
        UNDER_REVIEW: "UNDER_REVIEW";
        GENERATED: "GENERATED";
        ACKNOWLEDGED: "ACKNOWLEDGED";
        ACTION_REQUIRED: "ACTION_REQUIRED";
        ESCALATED: "ESCALATED";
        RESOLVED: "RESOLVED";
        CLOSED: "CLOSED";
    }>>;
    open: z.ZodOptional<z.ZodCoercedBoolean<unknown>>;
    priority: z.ZodOptional<z.ZodEnum<{
        LOW: "LOW";
        MEDIUM: "MEDIUM";
        HIGH: "HIGH";
        CRITICAL: "CRITICAL";
    }>>;
    assignedToMe: z.ZodOptional<z.ZodCoercedBoolean<unknown>>;
    patientId: z.ZodOptional<z.ZodString>;
    episodeId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const assignAlertSchema: z.ZodObject<{
    userId: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const alertActionSchema: z.ZodObject<{
    type: z.ZodEnum<{
        NOTE: "NOTE";
        PATIENT_CONTACT_ATTEMPT: "PATIENT_CONTACT_ATTEMPT";
        PATIENT_CONTACTED: "PATIENT_CONTACTED";
        CLINICAL_REVIEW: "CLINICAL_REVIEW";
        ADVICE_GIVEN: "ADVICE_GIVEN";
        APPOINTMENT_ARRANGED: "APPOINTMENT_ARRANGED";
        REFERRED: "REFERRED";
    }>;
    notes: z.ZodString;
    contactOutcome: z.ZodOptional<z.ZodEnum<{
        REACHED: "REACHED";
        NO_ANSWER: "NO_ANSWER";
        WRONG_NUMBER: "WRONG_NUMBER";
        VOICEMAIL: "VOICEMAIL";
        CALLBACK_REQUESTED: "CALLBACK_REQUESTED";
    }>>;
    setStatus: z.ZodOptional<z.ZodEnum<{
        UNDER_REVIEW: "UNDER_REVIEW";
        ACTION_REQUIRED: "ACTION_REQUIRED";
    }>>;
}, z.core.$strip>;
export declare const resolveAlertSchema: z.ZodObject<{
    outcome: z.ZodEnum<{
        ADVICE_GIVEN: "ADVICE_GIVEN";
        APPOINTMENT_ARRANGED: "APPOINTMENT_ARRANGED";
        OTHER: "OTHER";
        REFERRED_TO_EMERGENCY: "REFERRED_TO_EMERGENCY";
        MEDICATION_REVIEWED: "MEDICATION_REVIEWED";
        NO_ACTION_REQUIRED: "NO_ACTION_REQUIRED";
        PATIENT_UNREACHABLE: "PATIENT_UNREACHABLE";
    }>;
    notes: z.ZodString;
}, z.core.$strip>;
export declare const createManualAlertSchema: z.ZodObject<{
    episodeId: z.ZodString;
    priority: z.ZodEnum<{
        LOW: "LOW";
        MEDIUM: "MEDIUM";
        HIGH: "HIGH";
        CRITICAL: "CRITICAL";
    }>;
    title: z.ZodString;
    summary: z.ZodString;
}, z.core.$strip>;
export declare const createAppointmentSchema: z.ZodObject<{
    episodeId: z.ZodString;
    clinicianId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        REHABILITATION: "REHABILITATION";
        FOLLOW_UP: "FOLLOW_UP";
        REVIEW: "REVIEW";
        INVESTIGATION: "INVESTIGATION";
        WOUND_CHECK: "WOUND_CHECK";
        OTHER: "OTHER";
    }>;
    mode: z.ZodDefault<z.ZodEnum<{
        IN_PERSON: "IN_PERSON";
        PHONE: "PHONE";
        VIDEO: "VIDEO";
    }>>;
    scheduledAt: z.ZodISODateTime;
    durationMinutes: z.ZodDefault<z.ZodNumber>;
    location: z.ZodOptional<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    reminderOffsetsMinutes: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export declare const updateAppointmentSchema: z.ZodObject<{
    clinicianId: z.ZodOptional<z.ZodString>;
    scheduledAt: z.ZodOptional<z.ZodISODateTime>;
    durationMinutes: z.ZodOptional<z.ZodNumber>;
    location: z.ZodOptional<z.ZodString>;
    instructions: z.ZodOptional<z.ZodString>;
    mode: z.ZodOptional<z.ZodEnum<{
        IN_PERSON: "IN_PERSON";
        PHONE: "PHONE";
        VIDEO: "VIDEO";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        CANCELLED: "CANCELLED";
        MISSED: "MISSED";
        ATTENDED: "ATTENDED";
    }>>;
    reason: z.ZodOptional<z.ZodString>;
    followUpNote: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const appointmentResponseSchema: z.ZodObject<{
    action: z.ZodEnum<{
        CONFIRM: "CONFIRM";
        REQUEST_RESCHEDULE: "REQUEST_RESCHEDULE";
    }>;
    reason: z.ZodOptional<z.ZodString>;
    preferredDates: z.ZodOptional<z.ZodArray<z.ZodISODate>>;
}, z.core.$strip>;
export declare const exerciseSchema: z.ZodObject<{
    name: z.ZodString;
    instructions: z.ZodString;
    sets: z.ZodOptional<z.ZodNumber>;
    repetitions: z.ZodOptional<z.ZodNumber>;
    holdSeconds: z.ZodOptional<z.ZodNumber>;
    frequencyText: z.ZodString;
    timesOfDay: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const createRehabPlanSchema: z.ZodObject<{
    episodeId: z.ZodString;
    physiotherapistId: z.ZodString;
    goals: z.ZodArray<z.ZodString>;
    exercises: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        instructions: z.ZodString;
        sets: z.ZodOptional<z.ZodNumber>;
        repetitions: z.ZodOptional<z.ZodNumber>;
        holdSeconds: z.ZodOptional<z.ZodNumber>;
        frequencyText: z.ZodString;
        timesOfDay: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>>;
    milestones: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        targetDate: z.ZodOptional<z.ZodISODate>;
    }, z.core.$strip>>>;
    startDate: z.ZodISODate;
    endDate: z.ZodOptional<z.ZodISODate>;
}, z.core.$strip>;
export declare const createRehabSessionSchema: z.ZodObject<{
    planId: z.ZodString;
    scheduledAt: z.ZodISODateTime;
    durationMinutes: z.ZodDefault<z.ZodNumber>;
    location: z.ZodOptional<z.ZodString>;
    mode: z.ZodDefault<z.ZodEnum<{
        IN_PERSON: "IN_PERSON";
        PHONE: "PHONE";
        VIDEO: "VIDEO";
    }>>;
}, z.core.$strip>;
export declare const recordRehabSessionSchema: z.ZodObject<{
    status: z.ZodEnum<{
        CANCELLED: "CANCELLED";
        MISSED: "MISSED";
        ATTENDED: "ATTENDED";
    }>;
    progressNotes: z.ZodOptional<z.ZodString>;
    assessment: z.ZodOptional<z.ZodObject<{
        painScore: z.ZodOptional<z.ZodNumber>;
        mobilityNotes: z.ZodOptional<z.ZodString>;
        functionalScore: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const rehabDifficultySchema: z.ZodObject<{
    difficulty: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
    idempotencyKey: z.ZodString;
}, z.core.$strip>;
export declare const achieveMilestoneSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const inviteCaregiverSchema: z.ZodObject<{
    patientId: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    relationship: z.ZodString;
    email: z.ZodOptional<z.ZodEmail>;
    phone: z.ZodOptional<z.ZodString>;
    scopes: z.ZodArray<z.ZodEnum<{
        [x: string]: string;
    }>>;
    expiresInDays: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const updateCaregiverScopesSchema: z.ZodObject<{
    scopes: z.ZodArray<z.ZodEnum<{
        [x: string]: string;
    }>>;
}, z.core.$strip>;
export declare const grantConsentSchema: z.ZodObject<{
    patientId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<{
        RECOVERY_PROGRAMME_PARTICIPATION: "RECOVERY_PROGRAMME_PARTICIPATION";
        DATA_PROCESSING: "DATA_PROCESSING";
        AI_ASSISTED_FEATURES: "AI_ASSISTED_FEATURES";
        SMS_NOTIFICATIONS: "SMS_NOTIFICATIONS";
        WHATSAPP_NOTIFICATIONS: "WHATSAPP_NOTIFICATIONS";
        VOICE_RECORDING_RETENTION: "VOICE_RECORDING_RETENTION";
    }>;
    version: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<{
        IN_APP: "IN_APP";
        WRITTEN: "WRITTEN";
        VERBAL_RECORDED_BY_STAFF: "VERBAL_RECORDED_BY_STAFF";
    }>>;
}, z.core.$strip>;
export declare const revokeConsentSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const createConversationSchema: z.ZodObject<{
    patientId: z.ZodOptional<z.ZodString>;
    episodeId: z.ZodOptional<z.ZodString>;
    subject: z.ZodString;
    category: z.ZodDefault<z.ZodEnum<{
        MEDICATION: "MEDICATION";
        REHABILITATION: "REHABILITATION";
        GENERAL: "GENERAL";
        OTHER: "OTHER";
        SYMPTOM: "SYMPTOM";
        APPOINTMENT: "APPOINTMENT";
        ADMINISTRATIVE: "ADMINISTRATIVE";
    }>>;
    initialMessage: z.ZodString;
}, z.core.$strip>;
export declare const sendMessageSchema: z.ZodObject<{
    body: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<{
        TEXT: "TEXT";
        CALLBACK_REQUEST: "CALLBACK_REQUEST";
    }>>;
    attachmentIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const assignConversationSchema: z.ZodObject<{
    userId: z.ZodString;
}, z.core.$strip>;
export declare const inviteStaffSchema: z.ZodObject<{
    email: z.ZodEmail;
    phone: z.ZodOptional<z.ZodString>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    roles: z.ZodArray<z.ZodEnum<{
        PLATFORM_SUPER_ADMIN: "PLATFORM_SUPER_ADMIN";
        PLATFORM_SUPPORT: "PLATFORM_SUPPORT";
        HOSPITAL_ADMIN: "HOSPITAL_ADMIN";
        MEDICAL_DIRECTOR: "MEDICAL_DIRECTOR";
        DOCTOR: "DOCTOR";
        DISCHARGE_NURSE: "DISCHARGE_NURSE";
        RECOVERY_NURSE: "RECOVERY_NURSE";
        RECOVERY_COORDINATOR: "RECOVERY_COORDINATOR";
        PHARMACIST: "PHARMACIST";
        PHYSIOTHERAPIST: "PHYSIOTHERAPIST";
        QUALITY_OFFICER: "QUALITY_OFFICER";
        PATIENT: "PATIENT";
        CAREGIVER: "CAREGIVER";
    }>>;
    departmentIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateStaffSchema: z.ZodObject<{
    roles: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        PLATFORM_SUPER_ADMIN: "PLATFORM_SUPER_ADMIN";
        PLATFORM_SUPPORT: "PLATFORM_SUPPORT";
        HOSPITAL_ADMIN: "HOSPITAL_ADMIN";
        MEDICAL_DIRECTOR: "MEDICAL_DIRECTOR";
        DOCTOR: "DOCTOR";
        DISCHARGE_NURSE: "DISCHARGE_NURSE";
        RECOVERY_NURSE: "RECOVERY_NURSE";
        RECOVERY_COORDINATOR: "RECOVERY_COORDINATOR";
        PHARMACIST: "PHARMACIST";
        PHYSIOTHERAPIST: "PHYSIOTHERAPIST";
        QUALITY_OFFICER: "QUALITY_OFFICER";
        PATIENT: "PATIENT";
        CAREGIVER: "CAREGIVER";
    }>>>;
    departmentIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const createDepartmentSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateHospitalSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEmail>;
    phone: z.ZodOptional<z.ZodString>;
    emergencyPhone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        line1: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        country: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    timezone: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodObject<{
        defaultCheckInTime: z.ZodOptional<z.ZodString>;
        taskGenerationWindowDays: z.ZodOptional<z.ZodNumber>;
        missedTaskGraceMinutes: z.ZodOptional<z.ZodNumber>;
        breakGlassEnabled: z.ZodOptional<z.ZodBoolean>;
        aiFeaturesEnabled: z.ZodOptional<z.ZodBoolean>;
        defaultLanguage: z.ZodOptional<z.ZodEnum<{
            en: "en";
            ha: "ha";
            pcm: "pcm";
        }>>;
        emergencyInstructions: z.ZodOptional<z.ZodString>;
        notificationChannels: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            PUSH: "PUSH";
            SMS: "SMS";
            EMAIL: "EMAIL";
            WHATSAPP: "WHATSAPP";
        }>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const breakGlassSchema: z.ZodObject<{
    patientId: z.ZodString;
    reason: z.ZodString;
    durationMinutes: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const aiExplainSchema: z.ZodObject<{
    dischargePlanVersionId: z.ZodString;
    section: z.ZodEnum<{
        clinicalInstructions: "clinicalInstructions";
        medications: "medications";
        woundCare: "woundCare";
        activityRestrictions: "activityRestrictions";
        dietaryInstructions: "dietaryInstructions";
        warningSigns: "warningSigns";
        education: "education";
    }>;
    itemIndex: z.ZodNumber;
    language: z.ZodDefault<z.ZodEnum<{
        en: "en";
        ha: "ha";
        pcm: "pcm";
    }>>;
}, z.core.$strip>;
export declare const aiClassifySchema: z.ZodObject<{
    messageId: z.ZodString;
}, z.core.$strip>;
export declare const aiSummariseSchema: z.ZodObject<{
    episodeId: z.ZodString;
    periodDays: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export declare const analyticsQuery: z.ZodObject<{
    from: z.ZodOptional<z.ZodISODate>;
    to: z.ZodOptional<z.ZodISODate>;
    departmentId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const satisfactionSchema: z.ZodObject<{
    episodeId: z.ZodString;
    score: z.ZodNumber;
    comment: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
