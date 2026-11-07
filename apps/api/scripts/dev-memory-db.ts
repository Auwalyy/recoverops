/**
 * Local MongoDB without Docker: starts a single-node replica set (transactions work)
 * on mongodb://127.0.0.1:27017 with data persisted in apps/api/.mongo-data.
 *   npm run db:memory -w @recoveros/api
 * Prefer `docker compose up mongo redis` when Docker is available.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function main() {
  const dbPath = path.resolve(__dirname, '../.mongo-data');
  mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: 27017, dbPath, ip: '127.0.0.1' }],
  });
  // eslint-disable-next-line no-console
  console.log(`MongoDB replica set ready: ${rs.getUri('recoveros')}`);
  const stop = async () => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}
void main();
