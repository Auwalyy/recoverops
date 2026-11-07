import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env';

const handler = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void }; locals: { requestId?: string } }) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' },
    requestId: res.locals.requestId,
  });

/**
 * Rate limits. The in-memory store is per-instance; for horizontally scaled
 * deployments configure a shared Redis store (see DEPLOYMENT_GUIDE.md).
 */
export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: isTest ? 10_000 : env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: handler as never,
});

/** Strict limit for credential endpoints (login, reset, verification, invitations). */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: isTest ? 10_000 : env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: handler as never,
});

/** AI endpoints are costly; limit per client. */
export const aiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: handler as never,
});
