import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintAccessTokenFor } from '../platform/access-token-service.js';
import { TAB_COMPLETE_TOKEN_RESERVATION } from './creation-limits.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});
async function fixture(quota = 2) {
  vi.stubEnv('TAB_COMPLETE', 'true');
  vi.stubEnv('LOCAL_TAB_COMPLETE', 'true');
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:local-editor' });
  const { token } = await mintAccessTokenFor(store, {
    uid: 'g:local-editor',
    name: 'test',
    createdByUid: 'g:local-editor',
  });
  const complete = vi.fn(async () => ({ completion: ' = 1;', tokens: { input: 50, output: 5 } }));
  const app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    tabCompleter: { complete },
    creatorCodeRoutes: { store, dailyTabCompleteQuota: quota },
  });
  apps.push(app);
  const headers = { authorization: `Bearer ${token}` };
  const post = (
    payload: unknown = { path: 'game.ts', prefixWindow: 'const score', suffixWindow: '' },
    auth = headers,
  ) => app.inject({ method: 'POST', url: '/api/me/code/completion', headers: auth, payload });
  return { store, app, headers, post, complete };
}
it('requires a real account, without requiring a registered game or Studio round', async () => {
  const f = await fixture();
  expect((await f.post(undefined, { authorization: '' })).statusCode).toBe(401);
  const availability = await f.app.inject({ method: 'GET', url: '/api/me/code/completion', headers: f.headers });
  expect(availability.json()).toEqual({ enabled: true });
  expect(f.complete).not.toHaveBeenCalled();
  expect((await f.post()).json()).toEqual({ completion: ' = 1;' });
  expect(f.complete).toHaveBeenCalledWith({ path: 'game.ts', prefixWindow: 'const score', suffixWindow: '' });
  expect((await f.store.getUsage('g:local-editor', new Date().toISOString().slice(0, 10))).tabCompletes).toBe(1);
});
it('honours account blocking, the existing kill switch and shared daily quota', async () => {
  const f = await fixture();
  expect((await f.post()).statusCode).toBe(200);
  expect((await f.post()).statusCode).toBe(200);
  expect((await f.post()).statusCode).toBe(429);
  expect(f.complete).toHaveBeenCalledTimes(2);
  vi.stubEnv('TAB_COMPLETE', 'false');
  expect((await f.post()).statusCode).toBe(404);
  await f.store.upsertUser({ uid: 'g:local-editor', tier: 'blocked' });
  expect((await f.post()).statusCode).toBe(403);
});
it('respects the shared global pause before spending a personal slot', async () => {
  const f = await fixture();
  await f.store.setCreationLimits({ tabCompletePaused: true }, 'test');
  expect((await f.post()).statusCode).toBe(503);
  expect(f.complete).not.toHaveBeenCalled();
  expect((await f.store.getUsage('g:local-editor', new Date().toISOString().slice(0, 10))).tabCompletes).toBe(0);
});
it('supports nested deliverable paths within the same path bound as Studio', async () => {
  const f = await fixture();
  const path = 'game/' + 'nested/'.repeat(7) + 'logic.ts';
  expect((await f.post({ path, prefixWindow: '', suffixWindow: '' })).statusCode).toBe(200);
  expect(f.complete).toHaveBeenCalledWith({ path, prefixWindow: '', suffixWindow: '' });
  expect(
    (await f.post({ path: 'nested/'.repeat(18) + 'logic.ts', prefixWindow: '', suffixWindow: '' })).statusCode,
  ).toBe(400);
  expect(f.complete).toHaveBeenCalledTimes(1);
});
it.each(['LOCAL_TAB_COMPLETE', 'CODE_SURFACE'])('disables only the local route when %s is false', async (flag) => {
  const f = await fixture();
  vi.stubEnv(flag, 'false');
  expect((await f.app.inject({ method: 'GET', url: '/api/me/code/completion', headers: f.headers })).json()).toEqual({
    enabled: false,
  });
  expect((await f.post()).statusCode).toBe(404);
  expect(f.complete).not.toHaveBeenCalled();
});
it('accounts for global token reservations and does not log provider failures', async () => {
  const f = await fixture();
  expect((await f.post()).statusCode).toBe(200);
  const date = new Date().toISOString().slice(0, 10);
  expect(await f.store.getGlobalTabCompleteTokenCount(date)).toBe(55);
  f.complete.mockRejectedValueOnce(Error('private prefix'));
  const res = await f.post();
  expect(res.statusCode).toBe(503);
  expect(res.body).not.toContain('private prefix');
  expect(await f.store.getGlobalTabCompleteTokenCount(date)).toBe(55);
  expect(TAB_COMPLETE_TOKEN_RESERVATION).toBeGreaterThan(55);
});
it.each([
  { path: '../secret.ts', prefixWindow: '', suffixWindow: '' },
  { path: 'game.ts', prefixWindow: 'x'.repeat(3001), suffixWindow: '' },
  { path: 'game.ts', prefixWindow: '', suffixWindow: 'x'.repeat(1201) },
  { path: 'game.ts', prefixWindow: '', suffixWindow: '', model: 'expensive' },
])('rejects unbounded or executable configuration %j', async (payload) => {
  const f = await fixture();
  expect((await f.post(payload)).statusCode).toBe(400);
  expect(f.complete).not.toHaveBeenCalled();
});
