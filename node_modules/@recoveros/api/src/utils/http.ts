import type { Request, Response } from 'express';
import type { PaginationMeta } from '@recoveros/shared';

export function ok<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>): Response {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}), requestId: res.locals.requestId });
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function paginated<T>(res: Response, items: T[], meta: PaginationMeta): Response {
  return res.status(200).json({ success: true, data: items, meta, requestId: res.locals.requestId });
}

export function pageMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Read a validated value stored by the `validate` middleware. */
export function validated<T>(req: Request, part: 'body' | 'query' | 'params'): T {
  return (req as unknown as { validated: Record<string, T> }).validated[part] as T;
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
