import pino from 'pino';
import { env, isProduction, isTest } from './env';

/**
 * Structured logger. Redaction is a safety net — code must still avoid logging
 * secrets or clinical free text in the first place.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'recoveros-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.newPassword',
      '*.currentPassword',
      '*.refreshToken',
      '*.accessToken',
      '*.token',
      '*.code',
      '*.apiKey',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  transport:
    !isProduction && !isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' } }
      : undefined,
});

export type Logger = typeof logger;
