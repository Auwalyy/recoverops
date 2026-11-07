/**
 * Offline outbox — queues PERMITTED patient submissions while offline and replays them
 * when connectivity returns.
 *
 * Safety rules:
 *  - Only low-risk, idempotent, patient-reported submissions are queueable (allow-list
 *    below). Discharge approvals, medication changes, alert resolution and any other
 *    privileged clinical decision can NEVER be queued offline.
 *  - Every item carries an idempotency key, so a replay after an uncertain failure
 *    never creates duplicates on the server.
 *  - Items rejected by the server (validation/permission/state) are moved to a
 *    "needs attention" list for the user instead of being retried forever.
 */
export const QUEUEABLE_KINDS = ['CHECK_IN', 'SYMPTOM', 'MEDICATION_EVENT', 'TASK_COMPLETE', 'REHAB_DIFFICULTY'] as const;
export type OutboxKind = (typeof QUEUEABLE_KINDS)[number];

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  path: string;
  body: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  status: 'PENDING' | 'FAILED';
  lastError?: string;
  /** Owner — items never replay under a different signed-in user. */
  userId: string;
}

export interface OutboxStore {
  list(userId: string): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface Sender {
  (path: string, body: Record<string, unknown>): Promise<void>;
}

/** Classifies a send failure: transient (retry later) or permanent (needs attention). */
export type FailureKind = 'TRANSIENT' | 'PERMANENT';

export class Outbox {
  private flushing = false;

  constructor(
    private store: OutboxStore,
    private send: Sender,
    private classify: (err: unknown) => FailureKind,
    private newId: () => string,
  ) {}

  async enqueue(userId: string, kind: OutboxKind, path: string, body: Record<string, unknown>): Promise<OutboxItem> {
    if (!QUEUEABLE_KINDS.includes(kind)) throw new Error(`${kind} cannot be queued offline`);
    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 8) {
      throw new Error('Queued submissions require an idempotency key');
    }
    const item: OutboxItem = { id: this.newId(), kind, path, body, createdAt: Date.now(), attempts: 0, status: 'PENDING', userId };
    await this.store.put(item);
    return item;
  }

  /** Replay pending items in order. Stops at the first transient (network) failure. */
  async flush(userId: string): Promise<{ sent: number; failed: number; remaining: number }> {
    if (this.flushing) return { sent: 0, failed: 0, remaining: (await this.pending(userId)).length };
    this.flushing = true;
    let sent = 0;
    let failed = 0;
    try {
      const items = (await this.store.list(userId)).filter((i) => i.status === 'PENDING').sort((a, b) => a.createdAt - b.createdAt);
      for (const item of items) {
        try {
          await this.send(item.path, item.body);
          await this.store.remove(item.id);
          sent++;
        } catch (err) {
          const kind = this.classify(err);
          if (kind === 'TRANSIENT') {
            await this.store.put({ ...item, attempts: item.attempts + 1, lastError: (err as Error)?.message });
            break;
          }
          await this.store.put({ ...item, attempts: item.attempts + 1, status: 'FAILED', lastError: (err as Error)?.message });
          failed++;
        }
      }
    } finally {
      this.flushing = false;
    }
    return { sent, failed, remaining: (await this.pending(userId)).length };
  }

  async pending(userId: string) {
    return (await this.store.list(userId)).filter((i) => i.status === 'PENDING');
  }

  async needsAttention(userId: string) {
    return (await this.store.list(userId)).filter((i) => i.status === 'FAILED');
  }

  discard(id: string) {
    return this.store.remove(id);
  }

  clearAll() {
    return this.store.clearAll();
  }
}
