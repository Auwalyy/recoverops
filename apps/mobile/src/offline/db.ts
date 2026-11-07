import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { OutboxItem, OutboxStore } from './outbox';

/**
 * Local SQLite store for the offline outbox and a small cache of approved recovery
 * information. The database is encrypted with SQLCipher (enabled via the expo-sqlite
 * config plugin) using a random key kept in the device keystore. In Expo Go (no
 * SQLCipher) the PRAGMA is ignored; development builds are encrypted.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function encryptionKey(): Promise<string> {
  const K = 'recoveros.dbKey';
  let key = await SecureStore.getItemAsync(K);
  if (!key) {
    key = Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '');
    await SecureStore.setItemAsync(K, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return key;
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('recoveros.db');
    const key = await encryptionKey();
    await db.execAsync(`PRAGMA key = '${key}';`);
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, last_error TEXT);
      CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    `);
    return db;
  })();
  return dbPromise;
}

interface OutboxRow {
  id: string;
  user_id: string;
  kind: string;
  path: string;
  body: string;
  created_at: number;
  attempts: number;
  status: string;
  last_error: string | null;
}

export const sqliteOutboxStore: OutboxStore = {
  async list(userId) {
    const db = await getDb();
    const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox WHERE user_id = ? ORDER BY created_at ASC', userId);
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      kind: r.kind as OutboxItem['kind'],
      path: r.path,
      body: JSON.parse(r.body) as Record<string, unknown>,
      createdAt: r.created_at,
      attempts: r.attempts,
      status: r.status as OutboxItem['status'],
      lastError: r.last_error ?? undefined,
    }));
  },
  async put(i) {
    const db = await getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO outbox (id, user_id, kind, path, body, created_at, attempts, status, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      i.id,
      i.userId,
      i.kind,
      i.path,
      JSON.stringify(i.body),
      i.createdAt,
      i.attempts,
      i.status,
      i.lastError ?? null,
    );
  },
  async remove(id) {
    const db = await getDb();
    await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  },
  async clearAll() {
    const db = await getDb();
    await db.runAsync('DELETE FROM outbox');
  },
};

/** Minimal cache of APPROVED, non-privileged data for offline viewing (per user). */
export const offlineCache = {
  async get<T>(userId: string, key: string): Promise<{ value: T; updatedAt: number } | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string; updated_at: number }>('SELECT value, updated_at FROM cache WHERE key = ? AND user_id = ?', key, userId);
    return row ? { value: JSON.parse(row.value) as T, updatedAt: row.updated_at } : null;
  },
  async set(userId: string, key: string, value: unknown) {
    const db = await getDb();
    await db.runAsync('INSERT OR REPLACE INTO cache (key, user_id, value, updated_at) VALUES (?, ?, ?, ?)', key, userId, JSON.stringify(value), Date.now());
  },
  async clearAll() {
    const db = await getDb();
    await db.runAsync('DELETE FROM cache');
  },
};
