import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env, isTest } from '../config/env';
import { logger } from '../config/logger';

/**
 * Queue abstraction.
 *  - `bullmq` driver: durable Redis-backed jobs with retries/backoff (all deployed envs).
 *  - `inline` driver: in-process execution for tests and Redis-less local development.
 *    Delayed jobs are NOT scheduled in tests; periodic sweepers (which also run in
 *    production as a safety net) cover them.
 */
export const QUEUE_NAME = 'recoveros';

export type JobName =
  | 'notifications.deliver'
  | 'alerts.escalate'
  | 'alerts.escalation-sweep'
  | 'tasks.generate-window'
  | 'tasks.mark-missed'
  | 'tasks.send-reminders'
  | 'appointments.reminders'
  | 'subscriptions.lifecycle';

export type JobProcessor = (data: Record<string, unknown>) => Promise<void>;

const processors = new Map<JobName, JobProcessor>();

export function registerProcessor(name: JobName, fn: JobProcessor): void {
  processors.set(name, fn);
}

export async function runProcessor(name: JobName, data: Record<string, unknown>): Promise<void> {
  const fn = processors.get(name);
  if (!fn) throw new Error(`No processor registered for job ${name}`);
  await fn(data);
}

let connection: IORedis | undefined;
let queue: Queue | undefined;
let worker: Worker | undefined;

export function getRedis(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
    connection.on('error', (err) => logger.error({ err: err.message }, 'Redis error'));
  }
  return connection;
}

function getQueue(): Queue {
  if (!queue) queue = new Queue(QUEUE_NAME, { connection: getRedis() });
  return queue;
}

export interface EnqueueOptions {
  /** Deterministic id → BullMQ ignores duplicates (idempotent enqueue). */
  jobId?: string;
  delayMs?: number;
  attempts?: number;
}

export async function enqueue(name: JobName, data: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<void> {
  if (env.QUEUE_DRIVER === 'inline') {
    if (opts.delayMs && opts.delayMs > 0) {
      if (isTest) return;
      setTimeout(() => void runProcessor(name, data).catch((err) => logger.error({ err, job: name }, 'Inline job failed')), opts.delayMs).unref();
      return;
    }
    // Run after the current request completes, like a real queue would.
    setImmediate(() => void runProcessor(name, data).catch((err) => logger.error({ err, job: name }, 'Inline job failed')));
    return;
  }
  const jobOpts: JobsOptions = {
    jobId: opts.jobId?.replace(/:/g, '_'),
    delay: opts.delayMs,
    attempts: opts.attempts ?? 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 24 * 3600, count: 10_000 },
    removeOnFail: { age: 14 * 24 * 3600 },
  };
  await getQueue().add(name, data, jobOpts);
}

/** Repeatable maintenance jobs (BullMQ job schedulers). */
export async function scheduleRepeatableJobs(): Promise<void> {
  if (env.QUEUE_DRIVER === 'inline') return;
  const q = getQueue();
  await q.upsertJobScheduler('tasks-mark-missed', { every: 15 * 60_000 }, { name: 'tasks.mark-missed', data: {} });
  await q.upsertJobScheduler('tasks-send-reminders', { every: 5 * 60_000 }, { name: 'tasks.send-reminders', data: {} });
  await q.upsertJobScheduler('alerts-escalation-sweep', { every: 2 * 60_000 }, { name: 'alerts.escalation-sweep', data: {} });
  await q.upsertJobScheduler('appointments-reminders', { every: 15 * 60_000 }, { name: 'appointments.reminders', data: {} });
  await q.upsertJobScheduler('tasks-generate-window', { pattern: '0 1 * * *' }, { name: 'tasks.generate-window', data: {} });
  await q.upsertJobScheduler('subscriptions-lifecycle', { pattern: '0 2 * * *' }, { name: 'subscriptions.lifecycle', data: {} });
}

export function startWorker(): Worker | undefined {
  if (env.QUEUE_DRIVER === 'inline') return undefined;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await runProcessor(job.name as JobName, (job.data ?? {}) as Record<string, unknown>);
    },
    { connection: getRedis(), concurrency: 10 },
  );
  worker.on('failed', (job, err) => logger.error({ job: job?.name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
  logger.info('BullMQ worker started');
  return worker;
}

export async function closeQueues(): Promise<void> {
  await worker?.close();
  await queue?.close();
  if (connection) await connection.quit().catch(() => undefined);
  worker = undefined;
  queue = undefined;
  connection = undefined;
}

export async function isRedisReady(): Promise<boolean> {
  if (env.QUEUE_DRIVER === 'inline') return true;
  try {
    return (await getRedis().ping()) === 'PONG';
  } catch {
    return false;
  }
}
