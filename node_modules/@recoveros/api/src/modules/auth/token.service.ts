import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { generateToken, sha256 } from '../../utils/crypto';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  typ: 'access';
}

export function signAccessToken(userId: string, sessionId: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_TTL_SECONDS * 1000);
  const token = jwt.sign({ sid: sessionId, typ: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: 'recoveros-clients',
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
  return { token, expiresAt };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.JWT_ISSUER,
      audience: 'recoveros-clients',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (decoded.typ !== 'access' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'Invalid access token');
    }
    return { sub: decoded.sub, sid: decoded.sid, typ: 'access' };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new AppError('TOKEN_EXPIRED', 'Access token expired');
    if (err instanceof AppError) throw err;
    throw new AppError('UNAUTHENTICATED', 'Invalid access token');
  }
}

/**
 * Refresh tokens are opaque random strings (not JWTs), bound to a session and stored
 * hashed. The HMAC pepper (JWT_REFRESH_SECRET) means a database leak alone does not
 * allow forging lookups.
 */
export function newRefreshToken(): { token: string; hash: string } {
  const token = generateToken(48);
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return sha256(`${env.JWT_REFRESH_SECRET}:${token}`);
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000);
}
