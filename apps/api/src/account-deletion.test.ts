import { describe, expect, it } from 'vitest';
import { runAccountDeletionSweep, scheduleAccountDeletion } from './account-deletion.js';
import { OperatorAccountDeletionError } from './erase-account.js';
import { InMemoryStore } from './store.js';

describe('delayed account deletion', () => {
  it('does not purge before the recovery deadline', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:stay' });
    await scheduleAccountDeletion({ store, uid: 'g:stay', now: () => Date.parse('2026-08-04T00:00:00Z') });

    const result = await runAccountDeletionSweep({
      store,
      now: () => Date.parse('2026-08-17T23:59:59Z'),
    });

    expect(result.scanned).toBe(0);
    expect(await store.getUser('g:stay')).not.toBeNull();
  });

  it('re-checks operator status during cleanup', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:promoted' });
    await store.scheduleAccountDeletion('g:promoted', '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z');

    const result = await runAccountDeletionSweep({
      store,
      adminUids: new Set(['g:promoted']),
      now: () => Date.parse('2026-08-04T00:00:00Z'),
    });

    expect(result.operatorAccountsSkipped).toEqual(['g:promoted']);
    expect(await store.getUser('g:promoted')).not.toBeNull();
  });

  it('rejects operators at the scheduling boundary', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:operator' });
    await expect(
      scheduleAccountDeletion({ store, uid: 'g:operator', adminUids: new Set(['g:operator']) }),
    ).rejects.toBeInstanceOf(OperatorAccountDeletionError);
  });
});
