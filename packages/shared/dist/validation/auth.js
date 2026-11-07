"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHospitalSchema = exports.confirmVerificationSchema = exports.requestVerificationSchema = exports.acceptInvitationSchema = exports.changePasswordSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.logoutSchema = exports.refreshSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("./common");
exports.loginSchema = zod_1.z.object({
    identifier: zod_1.z.string().trim().min(3).max(254).describe('Email address or phone number'),
    password: zod_1.z.string().min(1).max(128),
    device: zod_1.z
        .object({
        name: zod_1.z.string().max(100).optional(),
        platform: zod_1.z.enum(['android', 'ios', 'web', 'other']).optional(),
        pushToken: zod_1.z.string().max(400).optional(),
    })
        .optional(),
});
exports.refreshSchema = zod_1.z.object({ refreshToken: zod_1.z.string().min(20).max(512) });
exports.logoutSchema = zod_1.z.object({ refreshToken: zod_1.z.string().min(20).max(512).optional() });
exports.forgotPasswordSchema = zod_1.z.object({ identifier: zod_1.z.string().trim().min(3).max(254) });
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(20).max(256),
    password: common_1.password,
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1).max(128),
    newPassword: common_1.password,
});
/** Accepting an invitation (staff, patient or caregiver) creates or links an account. */
exports.acceptInvitationSchema = zod_1.z.object({
    token: zod_1.z.string().min(20).max(256),
    firstName: common_1.shortText.optional(),
    lastName: common_1.shortText.optional(),
    password: common_1.password,
    preferredLanguage: common_1.language.optional(),
});
exports.requestVerificationSchema = zod_1.z.object({ channel: zod_1.z.enum(['EMAIL', 'SMS']) });
exports.confirmVerificationSchema = zod_1.z.object({
    channel: zod_1.z.enum(['EMAIL', 'SMS']),
    code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
/** Public hospital registration; creates hospital in PENDING_VERIFICATION. */
exports.registerHospitalSchema = zod_1.z.object({
    hospital: zod_1.z.object({
        name: common_1.shortText,
        registrationNumber: zod_1.z.string().trim().min(2).max(64),
        type: zod_1.z.enum(['TEACHING', 'GENERAL', 'SPECIALIST', 'PRIVATE', 'FEDERAL_MEDICAL_CENTRE', 'CLINIC']),
        email: common_1.email,
        phone: common_1.phone,
        address: zod_1.z.object({
            line1: common_1.shortText,
            city: common_1.shortText,
            state: common_1.shortText,
            country: zod_1.z.string().length(2).default('NG'),
        }),
        timezone: zod_1.z.string().default('Africa/Lagos'),
    }),
    admin: zod_1.z.object({
        firstName: common_1.shortText,
        lastName: common_1.shortText,
        email: common_1.email,
        phone: common_1.phone.optional(),
        password: common_1.password,
    }),
});
