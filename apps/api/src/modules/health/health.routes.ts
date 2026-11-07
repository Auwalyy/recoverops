import { Router } from 'express';
import { isDatabaseReady } from '../../database/connection';
import { isRedisReady } from '../../jobs/queue';
import { env } from '../../config/env';

export const healthRouter = Router();

/** Liveness: the process is up. */
healthRouter.get('/live', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
});

/** Readiness: dependencies reachable. Returns 503 when not ready to serve traffic. */
healthRouter.get('/ready', async (_req, res) => {
  const [db, redis] = [isDatabaseReady(), await isRedisReady()];
  const ready = db && redis;
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { status: ready ? 'ready' : 'degraded', checks: { mongodb: db ? 'up' : 'down', redis: redis ? 'up' : 'down', queueDriver: env.QUEUE_DRIVER } },
  });
});
