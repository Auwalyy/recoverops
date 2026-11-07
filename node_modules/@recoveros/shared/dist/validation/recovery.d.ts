import { z } from 'zod';
export declare const createPatientSchema: z.ZodObject<{
    hospitalPatientRef: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    dateOfBirth: z.ZodISODate;
    sex: z.ZodEnum<{
        OTHER: "OTHER";
        FEMALE: "FEMALE";
        MALE: "MALE";
        UNDISCLOSED: "UNDISCLOSED";
    }>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEmail>;
    preferredLanguage: z.ZodDefault<z.ZodEnum<{
        en: "en";
        ha: "ha";
        pcm: "pcm";
    }>>;
    timezone: z.ZodDefault<z.ZodString>;
    contactPreferences: z.ZodDefault<z.ZodObject<{
        channels: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            PUSH: "PUSH";
            SMS: "SMS";
            EMAIL: "EMAIL";
            WHATSAPP: "WHATSAPP";
            PHONE_CALL: "PHONE_CALL";
        }>>>;
        quietHoursStart: z.ZodOptional<z.ZodString>;
        quietHoursEnd: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    emergencyContact: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        relationship: z.ZodString;
        phone: z.ZodString;
    }, z.core.$strip>>;
    address: z.ZodOptional<z.ZodObject<{
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    invitePatient: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export declare const updatePatientSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodOptional<z.ZodEmail>>;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    preferredLanguage: z.ZodOptional<z.ZodDefault<z.ZodEnum<{
        en: "en";
        ha: "ha";
        pcm: "pcm";
    }>>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    timezone: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    dateOfBirth: z.ZodOptional<z.ZodISODate>;
    sex: z.ZodOptional<z.ZodEnum<{
        OTHER: "OTHER";
        FEMALE: "FEMALE";
        MALE: "MALE";
        UNDISCLOSED: "UNDISCLOSED";
    }>>;
    contactPreferences: z.ZodOptional<z.ZodDefault<z.ZodObject<{
        channels: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            PUSH: "PUSH";
            SMS: "SMS";
            EMAIL: "EMAIL";
            WHATSAPP: "WHATSAPP";
            PHONE_CALL: "PHONE_CALL";
        }>>>;
        quietHoursStart: z.ZodOptional<z.ZodString>;
        quietHoursEnd: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    emergencyContact: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        relationship: z.ZodString;
        phone: z.ZodString;
    }, z.core.$strip>>>;
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
        DECEASED: "DECEASED";
        TRANSFERRED_OUT: "TRANSFERRED_OUT";
    }>>;
}, z.core.$strip>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export declare const patientSearchQuery: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        ACTIVE: "ACTIVE";
        INACTIVE: "INACTIVE";
        DECEASED: "DECEASED";
        TRANSFERRED_OUT: "TRANSFERRED_OUT";
    }>>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export declare const createEpisodeSchema: z.ZodObject<{
    patientId: z.ZodString;
    departmentId: z.ZodString;
    admissionReference: z.ZodOptional<z.ZodString>;
    diagnosisReference: z.ZodOptional<z.ZodString>;
    procedureReference: z.ZodOptional<z.ZodString>;
    admissionDate: z.ZodISODate;
    plannedDischargeDate: z.ZodOptional<z.ZodISODate>;
    responsibleDoctorId: z.ZodString;
    expectedReviewDate: z.ZodOptional<z.ZodISODate>;
    programmeName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;
export declare const updateEpisodeSchema: z.ZodObject<{
    admissionReference: z.ZodOptional<z.ZodString>;
    diagnosisReference: z.ZodOptional<z.ZodString>;
    procedureReference: z.ZodOptional<z.ZodString>;
    expectedReviewDate: z.ZodOptional<z.ZodISODate>;
    programmeName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const episodeTransitionSchema: z.ZodObject<{
    toStatus: z.ZodEnum<{
        DRAFT: "DRAFT";
        DISCHARGE_PENDING: "DISCHARGE_PENDING";
        ACTIVE: "ACTIVE";
        NEEDS_ATTENTION: "NEEDS_ATTENTION";
        UNDER_REVIEW: "UNDER_REVIEW";
        ON_HOLD: "ON_HOLD";
        COMPLETED: "COMPLETED";
        TRANSFERRED: "TRANSFERRED";
        CANCELLED: "CANCELLED";
    }>;
    reason: z.ZodString;
    transfer: z.ZodOptional<z.ZodObject<{
        destination: z.ZodString;
        destinationType: z.ZodEnum<{
            OTHER_HOSPITAL: "OTHER_HOSPITAL";
            OTHER_DEPARTMENT: "OTHER_DEPARTMENT";
            PRIMARY_CARE: "PRIMARY_CARE";
            OTHER_PATHWAY: "OTHER_PATHWAY";
        }>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    extendedReviewDate: z.ZodOptional<z.ZodISODate>;
}, z.core.$strip>;
export type EpisodeTransitionInput = z.infer<typeof episodeTransitionSchema>;
export declare const assignCareTeamSchema: z.ZodObject<{
    userId: z.ZodString;
    role: z.ZodEnum<{
        DOCTOR: "DOCTOR";
        DISCHARGE_NURSE: "DISCHARGE_NURSE";
        RECOVERY_NURSE: "RECOVERY_NURSE";
        RECOVERY_COORDINATOR: "RECOVERY_COORDINATOR";
        PHARMACIST: "PHARMACIST";
        PHYSIOTHERAPIST: "PHYSIOTHERAPIST";
        RESPONSIBLE_DOCTOR: "RESPONSIBLE_DOCTOR";
    }>;
}, z.core.$strip>;
export declare const recurrenceSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        ONCE: "ONCE";
        DAILY: "DAILY";
        WEEKLY: "WEEKLY";
        EVERY_N_DAYS: "EVERY_N_DAYS";
    }>;
    timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
    daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    intervalDays: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodOptional<z.ZodISODate>;
    durationDays: z.ZodOptional<z.ZodNumber>;
    endDate: z.ZodOptional<z.ZodISODate>;
}, z.core.$strip>;
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export declare const medicationInstructionSchema: z.ZodObject<{
    name: z.ZodString;
    strength: z.ZodOptional<z.ZodString>;
    dose: z.ZodString;
    route: z.ZodEnum<{
        OTHER: "OTHER";
        ORAL: "ORAL";
        TOPICAL: "TOPICAL";
        INHALED: "INHALED";
        SUBCUTANEOUS: "SUBCUTANEOUS";
        INTRAMUSCULAR: "INTRAMUSCULAR";
    }>;
    frequencyText: z.ZodString;
    schedule: z.ZodObject<{
        kind: z.ZodEnum<{
            ONCE: "ONCE";
            DAILY: "DAILY";
            WEEKLY: "WEEKLY";
            EVERY_N_DAYS: "EVERY_N_DAYS";
        }>;
        timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
        daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        intervalDays: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodOptional<z.ZodISODate>;
        durationDays: z.ZodOptional<z.ZodNumber>;
        endDate: z.ZodOptional<z.ZodISODate>;
    }, z.core.$strip>;
    instructions: z.ZodOptional<z.ZodString>;
    isPrn: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const instructionItemSchema: z.ZodObject<{
    title: z.ZodString;
    details: z.ZodString;
}, z.core.$strip>;
export declare const followUpSchema: z.ZodObject<{
    type: z.ZodEnum<{
        REHABILITATION: "REHABILITATION";
        FOLLOW_UP: "FOLLOW_UP";
        REVIEW: "REVIEW";
        INVESTIGATION: "INVESTIGATION";
        WOUND_CHECK: "WOUND_CHECK";
        OTHER: "OTHER";
    }>;
    description: z.ZodString;
    dueDate: z.ZodOptional<z.ZodISODate>;
    clinicianId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const scheduledActivitySchema: z.ZodObject<{
    type: z.ZodEnum<{
        MEDICATION: "MEDICATION";
        CHECK_IN: "CHECK_IN";
        WEEKLY_REVIEW: "WEEKLY_REVIEW";
        APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER";
        REHABILITATION: "REHABILITATION";
        WOUND_CARE: "WOUND_CARE";
        EDUCATION: "EDUCATION";
        MILESTONE: "MILESTONE";
        CUSTOM: "CUSTOM";
    }>;
    title: z.ZodString;
    instructions: z.ZodOptional<z.ZodString>;
    recurrence: z.ZodObject<{
        kind: z.ZodEnum<{
            ONCE: "ONCE";
            DAILY: "DAILY";
            WEEKLY: "WEEKLY";
            EVERY_N_DAYS: "EVERY_N_DAYS";
        }>;
        timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
        daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        intervalDays: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodOptional<z.ZodISODate>;
        durationDays: z.ZodOptional<z.ZodNumber>;
        endDate: z.ZodOptional<z.ZodISODate>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const dischargeContentSchema: z.ZodObject<{
    summary: z.ZodDefault<z.ZodString>;
    clinicalInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    medications: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        strength: z.ZodOptional<z.ZodString>;
        dose: z.ZodString;
        route: z.ZodEnum<{
            OTHER: "OTHER";
            ORAL: "ORAL";
            TOPICAL: "TOPICAL";
            INHALED: "INHALED";
            SUBCUTANEOUS: "SUBCUTANEOUS";
            INTRAMUSCULAR: "INTRAMUSCULAR";
        }>;
        frequencyText: z.ZodString;
        schedule: z.ZodObject<{
            kind: z.ZodEnum<{
                ONCE: "ONCE";
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                EVERY_N_DAYS: "EVERY_N_DAYS";
            }>;
            timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
            daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            intervalDays: z.ZodOptional<z.ZodNumber>;
            startDate: z.ZodOptional<z.ZodISODate>;
            durationDays: z.ZodOptional<z.ZodNumber>;
            endDate: z.ZodOptional<z.ZodISODate>;
        }, z.core.$strip>;
        instructions: z.ZodOptional<z.ZodString>;
        isPrn: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    woundCare: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    activityRestrictions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    dietaryInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    warningSigns: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    followUps: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<{
            REHABILITATION: "REHABILITATION";
            FOLLOW_UP: "FOLLOW_UP";
            REVIEW: "REVIEW";
            INVESTIGATION: "INVESTIGATION";
            WOUND_CHECK: "WOUND_CHECK";
            OTHER: "OTHER";
        }>;
        description: z.ZodString;
        dueDate: z.ZodOptional<z.ZodISODate>;
        clinicianId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    rehabilitationRequirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    education: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        details: z.ZodString;
    }, z.core.$strip>>>;
    activities: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<{
            MEDICATION: "MEDICATION";
            CHECK_IN: "CHECK_IN";
            WEEKLY_REVIEW: "WEEKLY_REVIEW";
            APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER";
            REHABILITATION: "REHABILITATION";
            WOUND_CARE: "WOUND_CARE";
            EDUCATION: "EDUCATION";
            MILESTONE: "MILESTONE";
            CUSTOM: "CUSTOM";
        }>;
        title: z.ZodString;
        instructions: z.ZodOptional<z.ZodString>;
        recurrence: z.ZodObject<{
            kind: z.ZodEnum<{
                ONCE: "ONCE";
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                EVERY_N_DAYS: "EVERY_N_DAYS";
            }>;
            timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
            daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            intervalDays: z.ZodOptional<z.ZodNumber>;
            startDate: z.ZodOptional<z.ZodISODate>;
            durationDays: z.ZodOptional<z.ZodNumber>;
            endDate: z.ZodOptional<z.ZodISODate>;
        }, z.core.$strip>;
    }, z.core.$strip>>>;
    checkInTemplateId: z.ZodOptional<z.ZodString>;
    checkInSchedule: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            ONCE: "ONCE";
            DAILY: "DAILY";
            WEEKLY: "WEEKLY";
            EVERY_N_DAYS: "EVERY_N_DAYS";
        }>;
        timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
        daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        intervalDays: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodOptional<z.ZodISODate>;
        durationDays: z.ZodOptional<z.ZodNumber>;
        endDate: z.ZodOptional<z.ZodISODate>;
    }, z.core.$strip>>;
    programmeDurationDays: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type DischargeContent = z.infer<typeof dischargeContentSchema>;
export declare const createDischargePlanSchema: z.ZodObject<{
    episodeId: z.ZodString;
    content: z.ZodObject<{
        summary: z.ZodDefault<z.ZodString>;
        clinicalInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        medications: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            strength: z.ZodOptional<z.ZodString>;
            dose: z.ZodString;
            route: z.ZodEnum<{
                OTHER: "OTHER";
                ORAL: "ORAL";
                TOPICAL: "TOPICAL";
                INHALED: "INHALED";
                SUBCUTANEOUS: "SUBCUTANEOUS";
                INTRAMUSCULAR: "INTRAMUSCULAR";
            }>;
            frequencyText: z.ZodString;
            schedule: z.ZodObject<{
                kind: z.ZodEnum<{
                    ONCE: "ONCE";
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    EVERY_N_DAYS: "EVERY_N_DAYS";
                }>;
                timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
                daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                intervalDays: z.ZodOptional<z.ZodNumber>;
                startDate: z.ZodOptional<z.ZodISODate>;
                durationDays: z.ZodOptional<z.ZodNumber>;
                endDate: z.ZodOptional<z.ZodISODate>;
            }, z.core.$strip>;
            instructions: z.ZodOptional<z.ZodString>;
            isPrn: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>>;
        woundCare: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        activityRestrictions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        dietaryInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        warningSigns: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        followUps: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                REHABILITATION: "REHABILITATION";
                FOLLOW_UP: "FOLLOW_UP";
                REVIEW: "REVIEW";
                INVESTIGATION: "INVESTIGATION";
                WOUND_CHECK: "WOUND_CHECK";
                OTHER: "OTHER";
            }>;
            description: z.ZodString;
            dueDate: z.ZodOptional<z.ZodISODate>;
            clinicianId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        rehabilitationRequirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        education: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        activities: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                MEDICATION: "MEDICATION";
                CHECK_IN: "CHECK_IN";
                WEEKLY_REVIEW: "WEEKLY_REVIEW";
                APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER";
                REHABILITATION: "REHABILITATION";
                WOUND_CARE: "WOUND_CARE";
                EDUCATION: "EDUCATION";
                MILESTONE: "MILESTONE";
                CUSTOM: "CUSTOM";
            }>;
            title: z.ZodString;
            instructions: z.ZodOptional<z.ZodString>;
            recurrence: z.ZodObject<{
                kind: z.ZodEnum<{
                    ONCE: "ONCE";
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    EVERY_N_DAYS: "EVERY_N_DAYS";
                }>;
                timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
                daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                intervalDays: z.ZodOptional<z.ZodNumber>;
                startDate: z.ZodOptional<z.ZodISODate>;
                durationDays: z.ZodOptional<z.ZodNumber>;
                endDate: z.ZodOptional<z.ZodISODate>;
            }, z.core.$strip>;
        }, z.core.$strip>>>;
        checkInTemplateId: z.ZodOptional<z.ZodString>;
        checkInSchedule: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                ONCE: "ONCE";
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                EVERY_N_DAYS: "EVERY_N_DAYS";
            }>;
            timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
            daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            intervalDays: z.ZodOptional<z.ZodNumber>;
            startDate: z.ZodOptional<z.ZodISODate>;
            durationDays: z.ZodOptional<z.ZodNumber>;
            endDate: z.ZodOptional<z.ZodISODate>;
        }, z.core.$strip>>;
        programmeDurationDays: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const updateDischargePlanSchema: z.ZodObject<{
    content: z.ZodObject<{
        summary: z.ZodDefault<z.ZodString>;
        clinicalInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        medications: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            strength: z.ZodOptional<z.ZodString>;
            dose: z.ZodString;
            route: z.ZodEnum<{
                OTHER: "OTHER";
                ORAL: "ORAL";
                TOPICAL: "TOPICAL";
                INHALED: "INHALED";
                SUBCUTANEOUS: "SUBCUTANEOUS";
                INTRAMUSCULAR: "INTRAMUSCULAR";
            }>;
            frequencyText: z.ZodString;
            schedule: z.ZodObject<{
                kind: z.ZodEnum<{
                    ONCE: "ONCE";
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    EVERY_N_DAYS: "EVERY_N_DAYS";
                }>;
                timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
                daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                intervalDays: z.ZodOptional<z.ZodNumber>;
                startDate: z.ZodOptional<z.ZodISODate>;
                durationDays: z.ZodOptional<z.ZodNumber>;
                endDate: z.ZodOptional<z.ZodISODate>;
            }, z.core.$strip>;
            instructions: z.ZodOptional<z.ZodString>;
            isPrn: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>>;
        woundCare: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        activityRestrictions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        dietaryInstructions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        warningSigns: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        followUps: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                REHABILITATION: "REHABILITATION";
                FOLLOW_UP: "FOLLOW_UP";
                REVIEW: "REVIEW";
                INVESTIGATION: "INVESTIGATION";
                WOUND_CHECK: "WOUND_CHECK";
                OTHER: "OTHER";
            }>;
            description: z.ZodString;
            dueDate: z.ZodOptional<z.ZodISODate>;
            clinicianId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        rehabilitationRequirements: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        education: z.ZodDefault<z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            details: z.ZodString;
        }, z.core.$strip>>>;
        activities: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<{
                MEDICATION: "MEDICATION";
                CHECK_IN: "CHECK_IN";
                WEEKLY_REVIEW: "WEEKLY_REVIEW";
                APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER";
                REHABILITATION: "REHABILITATION";
                WOUND_CARE: "WOUND_CARE";
                EDUCATION: "EDUCATION";
                MILESTONE: "MILESTONE";
                CUSTOM: "CUSTOM";
            }>;
            title: z.ZodString;
            instructions: z.ZodOptional<z.ZodString>;
            recurrence: z.ZodObject<{
                kind: z.ZodEnum<{
                    ONCE: "ONCE";
                    DAILY: "DAILY";
                    WEEKLY: "WEEKLY";
                    EVERY_N_DAYS: "EVERY_N_DAYS";
                }>;
                timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
                daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
                intervalDays: z.ZodOptional<z.ZodNumber>;
                startDate: z.ZodOptional<z.ZodISODate>;
                durationDays: z.ZodOptional<z.ZodNumber>;
                endDate: z.ZodOptional<z.ZodISODate>;
            }, z.core.$strip>;
        }, z.core.$strip>>>;
        checkInTemplateId: z.ZodOptional<z.ZodString>;
        checkInSchedule: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                ONCE: "ONCE";
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                EVERY_N_DAYS: "EVERY_N_DAYS";
            }>;
            timesOfDay: z.ZodDefault<z.ZodArray<z.ZodString>>;
            daysOfWeek: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            intervalDays: z.ZodOptional<z.ZodNumber>;
            startDate: z.ZodOptional<z.ZodISODate>;
            durationDays: z.ZodOptional<z.ZodNumber>;
            endDate: z.ZodOptional<z.ZodISODate>;
        }, z.core.$strip>>;
        programmeDurationDays: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const submitDischargePlanSchema: z.ZodObject<{
    comment: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const approveDischargePlanSchema: z.ZodObject<{
    decision: z.ZodEnum<{
        APPROVED: "APPROVED";
        REJECTED: "REJECTED";
    }>;
    comment: z.ZodOptional<z.ZodString>;
    dischargeDate: z.ZodOptional<z.ZodISODate>;
    activate: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const recordUnderstandingSchema: z.ZodObject<{
    method: z.ZodEnum<{
        TEACH_BACK: "TEACH_BACK";
        VERBAL_CONFIRMATION: "VERBAL_CONFIRMATION";
        WRITTEN: "WRITTEN";
        INTERPRETER_ASSISTED: "INTERPRETER_ASSISTED";
        CAREGIVER_CONFIRMED: "CAREGIVER_CONFIRMED";
    }>;
    understood: z.ZodBoolean;
    notes: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const completeTaskSchema: z.ZodObject<{
    status: z.ZodDefault<z.ZodEnum<{
        COMPLETED: "COMPLETED";
        SKIPPED: "SKIPPED";
    }>>;
    response: z.ZodOptional<z.ZodString>;
    completedAt: z.ZodOptional<z.ZodISODateTime>;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const taskListQuery: z.ZodObject<{
    from: z.ZodOptional<z.ZodISODateTime>;
    to: z.ZodOptional<z.ZodISODateTime>;
    status: z.ZodOptional<z.ZodEnum<{
        COMPLETED: "COMPLETED";
        CANCELLED: "CANCELLED";
        PENDING: "PENDING";
        MISSED: "MISSED";
        SKIPPED: "SKIPPED";
    }>>;
    type: z.ZodOptional<z.ZodEnum<{
        MEDICATION: "MEDICATION";
        CHECK_IN: "CHECK_IN";
        WEEKLY_REVIEW: "WEEKLY_REVIEW";
        APPOINTMENT_REMINDER: "APPOINTMENT_REMINDER";
        REHABILITATION: "REHABILITATION";
        WOUND_CARE: "WOUND_CARE";
        EDUCATION: "EDUCATION";
        MILESTONE: "MILESTONE";
        CUSTOM: "CUSTOM";
    }>>;
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
