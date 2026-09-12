import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

async function openSiteWithRungPulled() {
  const store = new InMemoryStore();
  await store.setCreationLimits({ anonymousPaused: true }, 'test');
  // No betaAllowedUids, so only the rung raises this wall.
  return { store, app: await buildApp({ store, sessionSecret }) };
}

describe('the anonymous rung', () => {
  it('leaves an open site open while the rung is clear', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret });
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });

  it('closes data routes to visitors once pulled', async () => {
    const { app } = await openSiteWithRungPulled();
    const res = await app.inject({ method: 'GET', url: '/api/catalog' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('keeps the doors a closed site still needs open', async () => {
    const { app } = await openSiteWithRungPulled();
    // Health, so probes and the client's own splash decision keep working.
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    // Sign-in, or nobody can get back in.
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).not.toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/waitlist' })).statusCode).not.toBe(401);
    await app.close();
  });

  it('passes the static shell through, or the sign-in button is unreachable', async () => {
    const { app } = await openSiteWithRungPulled();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});
