import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { reserveActorAndGameQuota } from './game-quota.js';

describe('reserveActorAndGameQuota', () => {
  it('spends the actor first, then the shared game cap', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', tier: 'standard' });
    const first = await reserveActorAndGameQuota(store, {
      actorUid: 'g:ada',
      slug: 'sky',
      dateStr: '2026-01-01',
      actorLimit: 2,
      gameLimit: 1,
      action: 'improvements',
    });
    expect(first).toMatchObject({ allowed: true, reason: null });

    const gameFull = await reserveActorAndGameQuota(store, {
      actorUid: 'g:ada',
      slug: 'sky',
      dateStr: '2026-01-01',
      actorLimit: 2,
      gameLimit: 1,
      action: 'improvements',
    });
    expect(gameFull).toMatchObject({ allowed: false, reason: 'game' });
  });

  it('refuses on the actor cap before touching the game', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', tier: 'standard' });
    const refused = await reserveActorAndGameQuota(store, {
      actorUid: 'g:ada',
      slug: 'sky',
      dateStr: '2026-01-01',
      actorLimit: 0,
      gameLimit: 5,
      action: 'improvements',
    });
    expect(refused).toMatchObject({ allowed: false, reason: 'actor' });
    expect(await store.getGameUsage('sky', '2026-01-01')).toMatchObject({ improvements: 0 });
  });

  it('lets a trusted actor skip the personal cap and still hit the game cap', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:ada', tier: 'trusted' });
    const first = await reserveActorAndGameQuota(store, {
      actorUid: 'g:ada',
      slug: 'sky',
      dateStr: '2026-01-01',
      actorLimit: 0,
      gameLimit: 1,
      action: 'improvements',
    });
    expect(first).toMatchObject({ allowed: true, reason: null });

    const gameFull = await reserveActorAndGameQuota(store, {
      actorUid: 'g:ada',
      slug: 'sky',
      dateStr: '2026-01-01',
      actorLimit: 0,
      gameLimit: 1,
      action: 'improvements',
    });
    expect(gameFull).toMatchObject({ allowed: false, reason: 'game' });
  });
});
