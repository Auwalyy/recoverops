import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';
import { AppError } from '../utils/errors';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    requestId: res.locals.requestId,
  });
}

/**
 * Central error handler. Client responses never include stack traces, query details or
 * internal identifiers in production; full detail goes to structured logs.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof mongoose.Error.ValidationError) {
    appErr = new AppError(
      'VALIDATION_ERROR',
      'Data validation failed',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    appErr = new AppError('VALIDATION_ERROR', `Invalid value for ${err.path}`);
  } else if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
    appErr = new AppError('CONFLICT', 'A record with these details already exists');
  } else if (err instanceof MulterError) {
    appErr =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError('PAYLOAD_TOO_LARGE', 'File is too large')
        : new AppError('VALIDATION_ERROR', 'Invalid file upload');
  } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.too.large') {
    appErr = new AppError('PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else if (typeof err === 'object' && err && (err as { type?: string }).type === 'entity.parse.failed') {
    appErr = new AppError('VALIDATION_ERROR', 'Malformed JSON body');
  } else {
    appErr = new AppError('INTERNAL_ERROR', 'An unexpected error occurred');
  }

  const log = { err, code: appErr.code, method: req.method, path: req.path, requestId: res.locals.requestId };
  if (appErr.status >= 500) logger.error(log, 'Request failed');
  else logger.debug(log, 'Request rejected');

  const internal = appErr.code === 'INTERNAL_ERROR';
  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: internal && isProduction ? 'An unexpected error occurred' : appErr.message,
      ...(appErr.details !== undefined && !internal ? { details: appErr.details } : {}),
    },
    requestId: res.locals.requestId,
  });
}
