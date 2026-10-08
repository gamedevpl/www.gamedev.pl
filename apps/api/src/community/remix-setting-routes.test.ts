import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { registerRemixSettingRoutes } from './remix-setting-routes.js';

async function serve(store: InMemoryStore, changed: string[]): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest('user', null);
  app.decorateRequest('authMethod', null);
  app.addHook('onRequest', async (request) => {
    const uid = request.headers['x-test-uid'];
    (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    (request as { authMethod?: unknown }).authMethod = typeof uid === 'string' ? 'session' : null;
  });
  await registerRemixSettingRoutes(app, {
    store,
    adminUids: new Set(['g:admin']),
    onChanged: (slug) => changed.push(slug),
  });
  await app.ready();
  return app;
}

describe('remix switch routes', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function setup() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.upsertUser({ uid: 'g:other' });
    const job = await store.createSubmission(1_000_001, 'g:owner', 'Neon');
    await store.setSubmissionSlug(job.jobId, 'neon');
    const changed: string[] = [];
    const app = await serve(store, changed);
    apps.push(app);
    return { app, store, changed };
  }

  it('defaults to off and lets the owner turn it on', async () => {
    const { app, store, changed } = await setup();
    const owner = { 'x-test-uid': 'g:owner' };
    expect((await app.inject({ method: 'GET', url: '/api/me/games/neon/remix', headers: owner })).json()).toEqual({
      mode: 'off',
    });
    expect(await store.listRemixOnSlugs()).toEqual([]);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/remix',
      headers: owner,
      payload: { mode: 'on' },
    });
    expect(put.json()).toEqual({ mode: 'on' });
    expect((await store.getRemixSettings('neon'))?.mode).toBe('on');
    expect(await store.listRemixOnSlugs()).toEqual(['neon']);
    expect(changed).toEqual(['neon']);
  });

  it('hides the switch from anyone but the owner', async () => {
    const { app } = await setup();
    const other = { 'x-test-uid': 'g:other' };
    expect((await app.inject({ method: 'GET', url: '/api/me/games/neon/remix', headers: other })).statusCode).toBe(404);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/remix',
      headers: other,
      payload: { mode: 'off' },
    });
    expect(put.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/me/games/neon/remix' })).statusCode).toBe(401);
  });

  it('rejects an unknown mode', async () => {
    const { app } = await setup();
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/neon/remix',
      headers: { 'x-test-uid': 'g:owner' },
      payload: { mode: 'maybe' },
    });
    expect(put.statusCode).toBe(400);
  });

  it('lets an admin turn on a platform game', async () => {
    const { app, store } = await setup();
    const admin = { 'x-test-uid': 'g:admin' };
    const read = await app.inject({ method: 'GET', url: '/api/admin/games/orbit/remix', headers: admin });
    expect(read.json()).toEqual({ mode: 'off' });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/admin/games/orbit/remix',
      headers: admin,
      payload: { mode: 'on' },
    });
    expect(put.json()).toEqual({ mode: 'on' });
    expect((await store.getRemixSettings('orbit'))?.mode).toBe('on');
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/admin/games/orbit/remix',
      headers: { 'x-test-uid': 'g:owner' },
      payload: { mode: 'off' },
    });
    expect(denied.statusCode).toBe(404);
  });
});
