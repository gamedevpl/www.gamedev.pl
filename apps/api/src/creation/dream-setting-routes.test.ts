import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { registerDreamSettingRoutes } from './dream-setting-routes.js';

async function serve(store: InMemoryStore): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const uid = request.headers['x-test-uid'];
    (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
  });
  await registerDreamSettingRoutes(app, { store, now: () => Date.parse('2026-10-18T10:00:00Z') });
  await app.ready();
  return app;
}

describe('per-game dreaming switch', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function setup() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.upsertUser({ uid: 'g:other' });
    // A draft: never published, still the owner's to switch.
    const job = await store.createSubmission(1_000_001, 'g:owner', 'Neon');
    await store.setSubmissionSlug(job.jobId, 'neon');
    const app = await serve(store);
    apps.push(app);
    return { app, store };
  }

  const owner = { 'x-test-uid': 'g:owner' };

  it('is on by default and the owner can turn it off and back on', async () => {
    const { app, store } = await setup();
    const get = () => app.inject({ method: 'GET', url: '/api/me/games/neon/dreams', headers: owner });
    expect((await get()).json()).toEqual({ on: true, accountMuted: false });

    const off = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/dreams',
      headers: owner,
      payload: { on: false },
    });
    expect(off.json()).toEqual({ on: false, accountMuted: false });
    expect(await store.getGameDreamsOffAt('neon')).toBe('2026-10-18T10:00:00.000Z');

    await app.inject({ method: 'PUT', url: '/api/me/games/neon/dreams', headers: owner, payload: { on: true } });
    expect((await get()).json()).toEqual({ on: true, accountMuted: false });
    expect(await store.getGameDreamsOffAt('neon')).toBeNull();
  });

  it('reports the account-wide mute so the rail can say why nothing comes', async () => {
    const { app, store } = await setup();
    await store.setProposalsMuted('g:owner', '2026-10-01T00:00:00Z');
    const res = await app.inject({ method: 'GET', url: '/api/me/games/neon/dreams', headers: owner });
    expect(res.json()).toEqual({ on: true, accountMuted: true });
  });

  it('answers 404 to anyone but the owner, 401 without a session, 400 on a bad body', async () => {
    const { app, store } = await setup();
    const other = { 'x-test-uid': 'g:other' };
    expect((await app.inject({ method: 'GET', url: '/api/me/games/neon/dreams', headers: other })).statusCode).toBe(
      404,
    );
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/dreams',
      headers: other,
      payload: { on: false },
    });
    expect(put.statusCode).toBe(404);
    expect(await store.getGameDreamsOffAt('neon')).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/api/me/games/neon/dreams' })).statusCode).toBe(401);
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/dreams',
      headers: owner,
      payload: { on: 'no' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
