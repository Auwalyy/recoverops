import { createServer } from 'node:http';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { closeQueues, scheduleRepeatableJobs, startWorker } from './jobs/queue';
import { registerJobProcessors } from './jobs/processors';
import { registerEventHandlers } from './events/handlers';
import { syncAccessRegistry } from './modules/access/registry-sync';
import { ensureDefaultPlans } from './modules/billing/billing.service';
import { closeRealtime, initRealtime } from './services/realtime';
import { createApp } from './app';

async function main(): Promise<void> {
  await connectDatabase();
  await syncAccessRegistry();
  await ensureDefaultPlans();

  registerJobProcessors();
  registerEventHandlers();

  const app = createApp();
  const server = createServer(app);
  initRealtime(server);

  if (env.QUEUE_DRIVER === 'bullmq') {
    await scheduleRepeatableJobs();
    if (env.RUN_WORKERS_IN_API) startWorker();
  }

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, docs: env.ENABLE_SWAGGER ? `${env.API_BASE_URL}/api/docs` : undefined }, 'RecoverOS API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    await closeRealtime();
    await closeQueues();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start RecoverOS API');
  process.exit(1);
});
