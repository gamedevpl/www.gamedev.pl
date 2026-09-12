import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { registerCreatorCodeRoutes } from './creator-code.js';

it('refuses stale manual staging when recovery claims the slug first', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  const app = Fastify();
  const stage = vi.fn();
  app.addHook('preHandler', async (req) => {
    req.user = { uid: 'g:creator' } as typeof req.user;
  });
  await registerCreatorCodeRoutes(app, { store, gamesStore: { putStagedSourceFile: stage } as unknown as GamesStore });
  try {
    await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'archived',
      currentVersion: 'old',
      publishedAt: '2026-08-01T00:00:00.000Z',
      takedownReason: 'deleted by creator',
    });
    const original = store.claimManualRoundSlug.bind(store);
    let recoveredJob = 0;
    const claim = vi.spyOn(store, 'claimManualRoundSlug').mockImplementationOnce(async (...args) => {
      recoveredJob = await store.allocateJobId();
      await store.createSubmission(recoveredJob, 'g:creator', 'Recovered');
      expect(
        await store.claimSubmissionSlug(recoveredJob, 'sky-dodge', 10, {
          key: 'recovery',
          spec: 'Local sources',
          locale: 'en',
        }),
      ).toBe(true);
      return original(...args);
    });
    try {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/me/studio/games/sky-dodge/sources/stage',

        payload: { path: 'game.ts', content: 'stale edit', rebuild: false },
      });
      expect(response.statusCode).toBe(409);
      const lostJob = claim.mock.calls[0]![0];
      expect((await store.getSubmission(lostJob))?.state).toBe('abandoned');
      expect((await store.listQueuedSubmissions()).map((row) => row.jobId)).not.toContain(lostJob);
      expect((await store.getSubmissionBySlug('sky-dodge'))?.jobId).toBe(recoveredJob);
      expect(stage).not.toHaveBeenCalled();
    } finally {
      claim.mockRestore();
    }
  } finally {
    await app.close();
  }
});

it('opens Code staging after a newer canceled round released the published game', async () => {
  const store = new InMemoryStore();
  await store.createSubmission(10, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(10, 'sky-dodge');
  await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
  await store.createSubmission(11, 'g:creator', 'Sky Dodge');
  await store.setSubmissionSlug(11, 'sky-dodge');
  await store.recordJobTransition(11, { to: 'canceled', at: new Date().toISOString(), by: 'operator' });
  await store.setSubmissionAbandoned(11, new Date().toISOString());
  const app = Fastify();
  const stage = vi.fn(async (_input: unknown) => ({ path: 'game.ts' }));
  app.addHook('preHandler', async (req) => {
    req.user = { uid: 'g:creator' } as typeof req.user;
  });
  await registerCreatorCodeRoutes(app, { store, gamesStore: { putStagedSourceFile: stage } as unknown as GamesStore });
  try {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/me/studio/games/sky-dodge/sources/stage',
      payload: { path: 'game.ts', content: 'new edit', rebuild: false },
    });
    expect(response.statusCode).toBe(200);
    expect(stage).toHaveBeenCalledOnce();
    expect(stage.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ slug: 'sky-dodge' }));
    expect((await store.getSubmissionBySlug('sky-dodge'))?.state).toBe('queued');
  } finally {
    await app.close();
  }
});
