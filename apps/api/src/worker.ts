/**
 * Standalone background worker (recommended for production): processes BullMQ jobs —
 * notification delivery, alert escalation, task generation/missed-task detection,
 * appointment reminders and subscription lifecycle. Scale independently of the API.
 */
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './database/connection';
import { closeQueues, scheduleRepeatableJobs, startWorker } from './jobs/queue';
import { registerJobProcessors } from './jobs/processors';
import { registerEventHandlers } from './events/handlers';

async function main(): Promise<void> {
  await connectDatabase();
  registerJobProcessors();
  registerEventHandlers();
  await scheduleRepeatableJobs();
  startWorker();
  const shutdown = async () => {
    await closeQueues();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
