import { create } from 'zustand';
import * as Network from 'expo-network';
import * as Crypto from 'expo-crypto';
import { api, ApiError } from '@/services/api/client';
import { Outbox, type FailureKind, type OutboxItem, type OutboxKind } from './outbox';
import { sqliteOutboxStore } from './db';

export function classifyFailure(err: unknown): FailureKind {
  if (err instanceof ApiError) {
    if (err.isNetwork || err.status >= 500 || err.status === 429 || err.status === 401) return 'TRANSIENT';
    return 'PERMANENT';
  }
  return 'TRANSIENT';
}

export const outbox = new Outbox(
  sqliteOutboxStore,
  async (path, body) => {
    await api(path, { method: 'POST', body });
  },
  classifyFailure,
  () => Crypto.randomUUID(),
);

interface SyncState {
  pending: number;
  needsAttention: OutboxItem[];
  lastSyncAt: number | null;
  syncing: boolean;
  online: boolean;
  refresh: (userId: string) => Promise<void>;
  flush: (userId: string) => Promise<void>;
  setOnline: (online: boolean) => void;
}

export const useSync = create<SyncState>((set, get) => ({
  pending: 0,
  needsAttention: [],
  lastSyncAt: null,
  syncing: false,
  online: true,
  setOnline: (online) => set({ online }),
  async refresh(userId) {
    const [p, f] = await Promise.all([outbox.pending(userId), outbox.needsAttention(userId)]);
    set({ pending: p.length, needsAttention: f });
  },
  async flush(userId) {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      const r = await outbox.flush(userId);
      if (r.sent > 0 || r.remaining === 0) set({ lastSyncAt: Date.now() });
    } finally {
      set({ syncing: false });
      await get().refresh(userId);
    }
  },
}));

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${Crypto.randomUUID()}`;
}

export async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return !!s.isConnected && s.isInternetReachable !== false;
  } catch {
    return true;
  }
}

/**
 * Submit now if online; otherwise (or on a network failure) queue for later.
 * Returns the server response when sent, or `{ queued: true }`.
 */
export async function submitOrQueue<T>(userId: string, kind: OutboxKind, path: string, body: Record<string, unknown>): Promise<{ queued: true } | { queued: false; data: T }> {
  if (await isOnline()) {
    try {
      const data = await api<T>(path, { method: 'POST', body });
      return { queued: false, data };
    } catch (err) {
      if (!(err instanceof ApiError && err.isNetwork)) throw err;
    }
  }
  await outbox.enqueue(userId, kind, path, body);
  await useSync.getState().refresh(userId);
  return { queued: true };
}
