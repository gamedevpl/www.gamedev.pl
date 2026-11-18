import { expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { opsTestVerifier, opsInject } from '../platform/ops-console.fixture.js';

it('only purges a queued game through the operator door with its exact slug', async () => {
  const store = new InMemoryStore();
  const purgeGame = vi.fn(async () => {});
  const slug = 'trash-test';
  await store.upsertUser({ uid: 'g:boss' });
  await store.createSubmission(1, 'g:owner', slug);
  await store.setSubmissionSlug(1, slug);
  const app = await buildApp({
    store,
    adminUids: 'g:boss',
    opsConsole: { verifier: opsTestVerifier },
    submissionRoutes: {
      agentChannel: { gamesStore: { purgeGame } as unknown as GamesStore },
    },
  });
  const url = '/api/admin/games/' + slug + '/purge';
  const purge = (uid: string, confirmation: string) =>
    opsInject(app, uid, { url, method: 'POST', payload: { confirmation } });
  try {
    expect((await purge('g:boss', slug)).statusCode).toBe(409);
    await store.gameTrash.change(slug, 'g:owner', 'trash', new Date().toISOString());
    expect((await purge('g:owner', slug)).statusCode).toBe(404);
    expect((await purge('g:boss', 'Trash-test')).statusCode).toBe(400);
    expect(purgeGame).not.toHaveBeenCalled();
    expect(
      (await opsInject(app, 'g:boss', { method: 'GET', url: '/api/admin/game-trash' })).json().games,
    ).toMatchObject([{ slug }]);
    expect((await purge('g:boss', slug)).statusCode).toBe(200);
    expect(purgeGame).toHaveBeenCalledExactlyOnceWith(slug);
    expect(await store.getSubmission(1)).toBeNull();
  } finally {
    await app.close();
  }
});
