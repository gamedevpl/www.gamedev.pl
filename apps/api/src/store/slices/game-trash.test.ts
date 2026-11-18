import { expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';
import { reapTrashedGames, purgeTrashedGame } from '../../platform/game-trash-reaper.js';
import type { GamesStore } from '../../delivery/games-store.js';

const slug = 'red-comet',
  uid = 'g:owner',
  at = '2026-01-01T00:00:00.000Z';
for (const [name, make] of [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
] as const) {
  it(name + ' guards every round and keeps the original purge deadline on retries', async () => {
    const store = make();
    for (const id of [1, 2]) {
      await store.createSubmission(id, uid, 'Red Comet');
      await store.setSubmissionSlug(id, slug);
    }
    await store.setDraftShared(1, at);
    await expect(store.gameTrash.change(slug, uid, 'trash', at)).rejects.toThrow('unpublish_first');
    await store.setDraftShared(1, null);
    await store.recordSettledOwner(slug, uid, 2, at, at);
    await expect(store.gameTrash.change(slug, 'g:editor', 'trash', at)).rejects.toThrow('owner');
    await store.gameTrash.change(slug, uid, 'trash', at);
    await store.gameTrash.change(slug, uid, 'trash', '2026-01-05T00:00:00.000Z');
    expect(await store.gameTrash.list()).toMatchObject([{ slug, purgeAfter: '2026-01-15T00:00:00.000Z' }]);
    await expect(store.setDraftShared(1, at)).rejects.toThrow('round_closed');
    expect((await store.listSubmissionsBySlug(slug)).every((r) => r.abandonedAt === at)).toBe(true);
    await expect(
      store.setPublication({ slug, currentVersion: 'v1', state: 'published', publishedAt: at }),
    ).rejects.toThrow('game_deleted');
  });
}

it('retries failed artifact cleanup, supports immediate operator purge and only reaps expired games', async () => {
  const store = new InMemoryStore();
  const purgeGame = vi.fn().mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(undefined);
  const games = { purgeGame } as unknown as GamesStore;
  const offline = async () => false;
  for (const [id, s] of [
    [1, slug],
    [2, 'other'],
  ] as const) {
    await store.createSubmission(id, uid, s);
    await store.setSubmissionSlug(id, s);
    await store.gameTrash.change(s, uid, 'trash', at);
  }
  expect(await reapTrashedGames(store, games, offline, Date.parse(at), vi.fn())).toBe(0);
  expect(purgeGame).not.toHaveBeenCalled();
  await expect(purgeTrashedGame(store, games, slug, async () => true)).rejects.toThrow('unpublish_first');
  await expect(purgeTrashedGame(store, games, slug, offline)).rejects.toThrow('storage unavailable');
  expect(await store.getSubmission(1)).toBeTruthy();
  await purgeTrashedGame(store, games, slug, offline);
  expect(await store.getSubmission(1)).toBeNull();
  expect(await store.gameTrash.reservesSlug(slug)).toBe(true);
  expect(await store.getSubmission(2)).toBeTruthy();
  expect(await reapTrashedGames(store, games, offline, Date.parse('2026-01-15'), vi.fn())).toBe(0);
  expect(await store.gameTrash.list()).toEqual([]);
});
