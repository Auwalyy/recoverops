import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Principal } from '../modules/access/principal';

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  principal?: Principal;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Assigns/propagates X-Request-Id and opens an async context for the request. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId, ip: req.ip, userAgent: req.header('user-agent')?.slice(0, 200) }, () => next());
}
