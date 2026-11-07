import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
    device: z.ZodOptional<z.ZodObject<{
        name: z.ZodOptional<z.ZodString>;
        platform: z.ZodOptional<z.ZodEnum<{
            android: "android";
            ios: "ios";
            web: "web";
            other: "other";
        }>>;
        pushToken: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const refreshSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export declare const logoutSchema: z.ZodObject<{
    refreshToken: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const forgotPasswordSchema: z.ZodObject<{
    identifier: z.ZodString;
}, z.core.$strip>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, z.core.$strip>;
/** Accepting an invitation (staff, patient or caregiver) creates or links an account. */
export declare const acceptInvitationSchema: z.ZodObject<{
    token: z.ZodString;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    password: z.ZodString;
    preferredLanguage: z.ZodOptional<z.ZodEnum<{
        en: "en";
        ha: "ha";
        pcm: "pcm";
    }>>;
}, z.core.$strip>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export declare const requestVerificationSchema: z.ZodObject<{
    channel: z.ZodEnum<{
        SMS: "SMS";
        EMAIL: "EMAIL";
    }>;
}, z.core.$strip>;
export declare const confirmVerificationSchema: z.ZodObject<{
    channel: z.ZodEnum<{
        SMS: "SMS";
        EMAIL: "EMAIL";
    }>;
    code: z.ZodString;
}, z.core.$strip>;
/** Public hospital registration; creates hospital in PENDING_VERIFICATION. */
export declare const registerHospitalSchema: z.ZodObject<{
    hospital: z.ZodObject<{
        name: z.ZodString;
        registrationNumber: z.ZodString;
        type: z.ZodEnum<{
            GENERAL: "GENERAL";
            TEACHING: "TEACHING";
            SPECIALIST: "SPECIALIST";
            PRIVATE: "PRIVATE";
            FEDERAL_MEDICAL_CENTRE: "FEDERAL_MEDICAL_CENTRE";
            CLINIC: "CLINIC";
        }>;
        email: z.ZodEmail;
        phone: z.ZodString;
        address: z.ZodObject<{
            line1: z.ZodString;
            city: z.ZodString;
            state: z.ZodString;
            country: z.ZodDefault<z.ZodString>;
        }, z.core.$strip>;
        timezone: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    admin: z.ZodObject<{
        firstName: z.ZodString;
        lastName: z.ZodString;
        email: z.ZodEmail;
        phone: z.ZodOptional<z.ZodString>;
        password: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;
