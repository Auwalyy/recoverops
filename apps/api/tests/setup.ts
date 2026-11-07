import { afterAll, beforeAll, inject } from 'vitest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { registerJobProcessors } from '../src/jobs/processors';
import { registerEventHandlers } from '../src/events/handlers';
import { syncAccessRegistry } from '../src/modules/access/registry-sync';
import { ensureDefaultPlans } from '../src/modules/billing/billing.service';

beforeAll(async () => {
  const base = inject('mongoUri');
  // Unique database per test file → files run in parallel without interference.
  const dbName = `recoveros_test_${randomUUID().slice(0, 8)}`;
  const uri = base.includes('?') ? base.replace('/?', `/${dbName}?`) : `${base}${dbName}`;
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  registerJobProcessors();
  registerEventHandlers();
  await syncAccessRegistry();
  await ensureDefaultPlans();
});

afterAll(async () => {
  // Let in-flight inline jobs settle before closing the connection.
  await new Promise((r) => setTimeout(r, 50));
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
});
