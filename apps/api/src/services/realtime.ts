import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { corsOrigins } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../modules/auth/token.service';
import { SessionModel } from '../modules/auth/auth.models';

/**
 * Socket.IO realtime layer.
 * - Connections authenticate with the same access token as REST.
 * - Each socket joins ONLY its private `user:<id>` room. There are no hospital-wide
 *   rooms, so patient data is never broadcast to a whole hospital.
 * - Payloads carry identifiers and status only; clients refetch details through the
 *   REST API, which applies full permission checks.
 */
let io: Server | undefined;

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: corsOrigins, credentials: false },
    path: '/realtime',
  });

  io.use(async (socket: Socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const claims = verifyAccessToken(token);
      const session = await SessionModel.findById(claims.sid).select('revokedAt expiresAt userId');
      if (!session || session.revokedAt || session.expiresAt < new Date()) return next(new Error('UNAUTHENTICATED'));
      socket.data.userId = claims.sub;
      socket.data.sessionId = claims.sid;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId as string}`);
    void socket.join(`session:${socket.data.sessionId as string}`);
    logger.debug({ userId: socket.data.userId }, 'Realtime client connected');
  });

  return io;
}

export function emitToUsers(userIds: Iterable<string>, event: string, payload: Record<string, unknown>): void {
  if (!io) return;
  for (const id of new Set(userIds)) io.to(`user:${id}`).emit(event, payload);
}

/** Force-disconnect sockets belonging to a revoked session. */
export function disconnectSession(sessionId: string): void {
  io?.in(`session:${sessionId}`).disconnectSockets(true);
}

export async function closeRealtime(): Promise<void> {
  await io?.close();
  io = undefined;
}
