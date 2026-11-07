import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import type { Permission } from '@recoveros/shared';
import { AppError, errors } from '../utils/errors';
import { verifyAccessToken } from '../modules/auth/token.service';
import { SessionModel } from '../modules/auth/auth.models';
import { UserModel } from '../modules/users/user.model';
import { resolvePrincipal, type Principal, type PrincipalKind } from '../modules/access/principal';
import { getContext } from './context';

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal;
    auth?: { userId: string; sessionId: string };
  }
}

const KINDS: PrincipalKind[] = ['PLATFORM', 'STAFF', 'PATIENT', 'CAREGIVER'];

interface AuthOptions {
  /** Allow authenticated users without any hospital relationship (e.g. /auth/me). */
  allowNoContext?: boolean;
}

/**
 * Authenticate the bearer token, verify the session is live and the user active, then
 * resolve the principal from the database (permissions are never read from the token).
 */
export function authenticate(options: AuthOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) throw errors.unauthenticated();
      const claims = verifyAccessToken(header.slice(7).trim());

      const session = await SessionModel.findById(claims.sid).select('userId revokedAt expiresAt activeHospitalId');
      if (!session || session.revokedAt || session.expiresAt < new Date() || String(session.userId) !== claims.sub) {
        throw new AppError('UNAUTHENTICATED', 'Session is no longer valid');
      }
      const user = await UserModel.findById(claims.sub);
      if (!user) throw errors.unauthenticated();
      if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 'This account is suspended');
      if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_NOT_ACTIVE', 'This account is not active');

      req.auth = { userId: claims.sub, sessionId: claims.sid };

      const hospitalHeader = req.header('x-hospital-id');
      if (hospitalHeader && !Types.ObjectId.isValid(hospitalHeader)) throw errors.validation('Invalid X-Hospital-Id');
      const kindHeader = req.header('x-acting-as')?.toUpperCase() as PrincipalKind | undefined;
      if (kindHeader && !KINDS.includes(kindHeader)) throw errors.validation('Invalid X-Acting-As');

      try {
        req.principal = await resolvePrincipal(user, claims.sid, {
          requestedHospitalId: hospitalHeader,
          requestedKind: kindHeader,
          sessionHospitalId: session.activeHospitalId ? String(session.activeHospitalId) : undefined,
        });
        const ctx = getContext();
        if (ctx) ctx.principal = req.principal;
      } catch (err) {
        if (!(options.allowNoContext && err instanceof AppError && err.code === 'FORBIDDEN')) throw err;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Require that the resolved principal holds ALL listed permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const p = req.principal;
    if (!p) return next(errors.unauthenticated());
    for (const perm of permissions) {
      if (!p.permissions.has(perm)) return next(errors.forbidden());
    }
    next();
  };
}

export function requireKind(...kinds: PrincipalKind[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const p = req.principal;
    if (!p) return next(errors.unauthenticated());
    if (!kinds.includes(p.kind)) return next(errors.forbidden('This action is not available for your account type'));
    next();
  };
}

export function principalOf(req: Request): Principal {
  if (!req.principal) throw errors.unauthenticated();
  return req.principal;
}
