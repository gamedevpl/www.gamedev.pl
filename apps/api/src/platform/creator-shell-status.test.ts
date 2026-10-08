import { describe, expect, it } from 'vitest';
import { CREATOR_NOT_FOUND, createCreatorShellStatus } from './creator-shell-status.js';

const alice = { uid: 'u1', handle: 'alice', createdAt: '2026-01-01T00:00:00Z' };

function storeWith(overrides: Record<string, unknown> = {}) {
  let reads = 0;
  const store = {
    getUserByHandle: async (handle: string) => {
      reads += 1;
      return handle === 'alice' ? alice : null;
    },
    getHandleReservation: async () => null,
    getUser: async () => null,
    ...overrides,
  } as never;
  return { store, reads: () => reads };
}

describe('createCreatorShellStatus', () => {
  it('says nothing about existing creators and other paths', async () => {
    const status = createCreatorShellStatus(storeWith().store);
    expect(await status({ url: '/alice' })).toBeNull();
    expect(await status({ url: '/creators/alice' })).toBeNull();
    expect(await status({ url: '/play/nobody' })).toBeNull();
    expect(await status({ url: '/gamedevpl' })).toBeNull();
  });

  it('reports handles nobody holds', async () => {
    const status = createCreatorShellStatus(storeWith().store);
    expect(await status({ url: '/nobody_here' })).toBe(CREATOR_NOT_FOUND);
  });

  it('keeps a renamed handle alive while its owner exists', async () => {
    const { store } = storeWith({
      getHandleReservation: async () => ({ releasedAt: '2026-01-02T00:00:00Z', previousUid: 'u1' }),
      getUser: async () => ({ ...alice, handle: 'alice_new' }),
    });
    expect(await createCreatorShellStatus(store)({ url: '/old_alice' })).toBeNull();
  });

  it('caches answers and caps lookups per minute', async () => {
    let clock = 0;
    const counted = storeWith();
    const status = createCreatorShellStatus(counted.store, () => clock);
    await status({ url: '/nobody_here' });
    await status({ url: '/creators/nobody_here' });
    expect(counted.reads()).toBe(1);
    for (let i = 0; i < 100; i += 1) await status({ url: `/ghost_${i}` });
    expect(counted.reads()).toBe(60);
    expect(await status({ url: '/ghost_999' })).toBeNull();
    clock = 60_000;
    expect(await status({ url: '/ghost_999' })).toBe(CREATOR_NOT_FOUND);
  });

  it('never calls a creator missing when the store fails', async () => {
    const { store } = storeWith({
      getUserByHandle: async () => {
        throw new Error('store down');
      },
    });
    expect(await createCreatorShellStatus(store)({ url: '/nobody_here' })).toBeNull();
  });
});
