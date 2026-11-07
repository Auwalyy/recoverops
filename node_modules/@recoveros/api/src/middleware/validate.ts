import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { errors } from '../utils/errors';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Validate request parts with Zod. Validated (coerced, defaulted, stripped) values are
 * stored on `req.validated` — handlers must read from there, never from raw input.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const out: Record<string, unknown> = {};
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        return next(
          errors.validation(
            'Request validation failed',
            result.error.issues.map((i) => ({ location: part, path: i.path.join('.'), message: i.message })),
          ),
        );
      }
      out[part] = result.data;
    }
    (req as unknown as { validated: Record<string, unknown> }).validated = out;
    next();
  };
}

export const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier') });
