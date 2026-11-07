import { Outbox, type OutboxItem, type OutboxStore } from '@/offline/outbox';

function memoryStore(): OutboxStore & { items: Map<string, OutboxItem> } {
  const items = new Map<string, OutboxItem>();
  return {
    items,
    list: async (userId) => [...items.values()].filter((i) => i.userId === userId),
    put: async (i) => void items.set(i.id, i),
    remove: async (id) => void items.delete(id),
    clearAll: async () => items.clear(),
  };
}

class NetErr extends Error {}
class RejectErr extends Error {}

describe('offline outbox', () => {
  let id = 0;
  const make = (send: (path: string, body: Record<string, unknown>) => Promise<void>) => {
    const store = memoryStore();
    const box = new Outbox(store, send, (e) => (e instanceof NetErr ? 'TRANSIENT' : 'PERMANENT'), () => `id-${++id}`);
    return { store, box };
  };

  it('only queues allow-listed, idempotent patient submissions', async () => {
    const { box } = make(async () => undefined);
    await expect(box.enqueue('u1', 'DISCHARGE_APPROVAL' as never, '/discharge-plans/x/approve', { idempotencyKey: 'abcdefgh1' })).rejects.toThrow(/cannot be queued/);
    await expect(box.enqueue('u1', 'CHECK_IN', '/check-ins', {})).rejects.toThrow(/idempotency/);
    await expect(box.enqueue('u1', 'CHECK_IN', '/check-ins', { idempotencyKey: 'checkin-123' })).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('replays in order and removes sent items', async () => {
    const sent: string[] = [];
    const { box } = make(async (_p, b) => void sent.push(String(b.idempotencyKey)));
    await box.enqueue('u1', 'CHECK_IN', '/check-ins', { idempotencyKey: 'key-00001' });
    await new Promise((r) => setTimeout(r, 2));
    await box.enqueue('u1', 'SYMPTOM', '/symptoms', { idempotencyKey: 'key-00002' });
    const r = await box.flush('u1');
    expect(r).toEqual({ sent: 2, failed: 0, remaining: 0 });
    expect(sent).toEqual(['key-00001', 'key-00002']);
  });

  it('stops on a network failure and keeps the item for later (no duplicates on retry)', async () => {
    let online = false;
    const sent: string[] = [];
    const { box } = make(async (_p, b) => {
      if (!online) throw new NetErr('offline');
      sent.push(String(b.idempotencyKey));
    });
    await box.enqueue('u1', 'CHECK_IN', '/check-ins', { idempotencyKey: 'key-10001' });
    expect((await box.flush('u1')).remaining).toBe(1);
    online = true;
    expect((await box.flush('u1')).sent).toBe(1);
    expect(sent).toEqual(['key-10001']);
  });

  it('moves server-rejected items to "needs attention" instead of retrying forever', async () => {
    const { box } = make(async () => {
      throw new RejectErr('episode closed');
    });
    await box.enqueue('u1', 'MEDICATION_EVENT', '/medication-events', { idempotencyKey: 'key-20001' });
    const r = await box.flush('u1');
    expect(r.failed).toBe(1);
    expect(await box.needsAttention('u1')).toHaveLength(1);
    expect(await box.pending('u1')).toHaveLength(0);
  });

  it("never replays another user's queued items", async () => {
    const sent: string[] = [];
    const { box } = make(async (_p, b) => void sent.push(String(b.idempotencyKey)));
    await box.enqueue('alice', 'CHECK_IN', '/check-ins', { idempotencyKey: 'alice-0001' });
    await box.flush('bob');
    expect(sent).toEqual([]);
  });
});
