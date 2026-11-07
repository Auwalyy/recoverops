import { z } from 'zod';
import { email, password, phone, shortText, language } from './common';

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(254).describe('Email address or phone number'),
  password: z.string().min(1).max(128),
  device: z
    .object({
      name: z.string().max(100).optional(),
      platform: z.enum(['android', 'ios', 'web', 'other']).optional(),
      pushToken: z.string().max(400).optional(),
    })
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const logoutSchema = z.object({ refreshToken: z.string().min(20).max(512).optional() });

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3).max(254) });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(256),
  password,
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

/** Accepting an invitation (staff, patient or caregiver) creates or links an account. */
export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(256),
  firstName: shortText.optional(),
  lastName: shortText.optional(),
  password,
  preferredLanguage: language.optional(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const requestVerificationSchema = z.object({ channel: z.enum(['EMAIL', 'SMS']) });
export const confirmVerificationSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS']),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

/** Public hospital registration; creates hospital in PENDING_VERIFICATION. */
export const registerHospitalSchema = z.object({
  hospital: z.object({
    name: shortText,
    registrationNumber: z.string().trim().min(2).max(64),
    type: z.enum(['TEACHING', 'GENERAL', 'SPECIALIST', 'PRIVATE', 'FEDERAL_MEDICAL_CENTRE', 'CLINIC']),
    email,
    phone,
    address: z.object({
      line1: shortText,
      city: shortText,
      state: shortText,
      country: z.string().length(2).default('NG'),
    }),
    timezone: z.string().default('Africa/Lagos'),
  }),
  admin: z.object({
    firstName: shortText,
    lastName: shortText,
    email,
    phone: phone.optional(),
    password,
  }),
});
export type RegisterHospitalInput = z.infer<typeof registerHospitalSchema>;
