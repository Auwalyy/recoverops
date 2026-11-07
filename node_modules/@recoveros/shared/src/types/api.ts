/** Standard API envelope used by every RecoverOS endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta & Record<string, unknown>;
  requestId?: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_NOT_ACTIVE',
  'FORBIDDEN',
  'TENANT_ACCESS_DENIED',
  'CONSENT_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'IMMUTABLE_RECORD',
  'RATE_LIMITED',
  'FEATURE_NOT_ENTITLED',
  'HOSPITAL_NOT_VERIFIED',
  'AI_UNAVAILABLE',
  'AI_OUTPUT_INVALID',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Shape of the authenticated session returned by /auth/login and /auth/me. */
export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  preferredLanguage: string;
  kind: 'PLATFORM' | 'STAFF' | 'PATIENT' | 'CAREGIVER';
  platformRoles: string[];
  memberships: Array<{
    hospitalId: string;
    hospitalName: string;
    roles: string[];
    departmentIds: string[];
  }>;
  patientProfiles: Array<{ patientId: string; hospitalId: string; hospitalName: string }>;
  caregiverOf: Array<{ consentId: string; patientId: string; hospitalId: string; patientName: string; scopes: string[] }>;
  activeHospitalId?: string;
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
