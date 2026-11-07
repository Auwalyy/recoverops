import type { ErrorCode } from '@recoveros/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_SUSPENDED: 403,
  ACCOUNT_NOT_ACTIVE: 403,
  FORBIDDEN: 403,
  TENANT_ACCESS_DENIED: 403,
  CONSENT_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  IMMUTABLE_RECORD: 409,
  RATE_LIMITED: 429,
  FEATURE_NOT_ENTITLED: 402,
  HOSPITAL_NOT_VERIFIED: 403,
  AI_UNAVAILABLE: 503,
  AI_OUTPUT_INVALID: 502,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** Operational error with a stable machine-readable code and a client-safe message. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const errors = {
  notFound: (resource = 'Resource') => new AppError('NOT_FOUND', `${resource} not found`),
  forbidden: (message = 'You do not have permission to perform this action') => new AppError('FORBIDDEN', message),
  unauthenticated: (message = 'Authentication required') => new AppError('UNAUTHENTICATED', message),
  conflict: (message: string, details?: unknown) => new AppError('CONFLICT', message, details),
  validation: (message: string, details?: unknown) => new AppError('VALIDATION_ERROR', message, details),
  invalidTransition: (from: string, to: string, resource = 'record') =>
    new AppError('INVALID_STATE_TRANSITION', `Cannot change ${resource} from ${from} to ${to}`, { from, to }),
  immutable: (message = 'This record is approved and cannot be modified; create a new version instead') =>
    new AppError('IMMUTABLE_RECORD', message),
};
