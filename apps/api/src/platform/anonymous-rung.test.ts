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

describe('what the rung closes that the beta wall does not', () => {
  it('stops serving media, which is the bandwidth it was pulled to stop', async () => {
    const { app } = await openSiteWithRungPulled();
    const res = await app.inject({ method: 'GET', url: '/api/games/apex-sprint/media/launch.png?w=320' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('leaves media public while only the beta wall is up', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    const app = await buildApp({ store, sessionSecret, betaAllowedUids: 'g:owner' });
    const res = await app.inject({ method: 'GET', url: '/api/games/apex-sprint/media/launch.png?w=320' });
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('promotional play under the rung', () => {
  it('stops handing out the bundle a public-play slug exempts', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ anonymousPaused: true }, 'test');
    const app = await buildApp({ store, sessionSecret, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({ method: 'GET', url: '/api/games/promo-game' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('leaves it playable while the rung is clear', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({ method: 'GET', url: '/api/games/promo-game' });
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('what a visitor is told while the rung is up', () => {
  it('reports the closure in health, so the client shows the waitlist', async () => {
    const { app } = await openSiteWithRungPulled();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    // AuthContext reads this; false renders the catalog error.
    expect(res.json().privateBeta).toBe(true);
    await app.close();
  });

  it('stops advertising promotional games while it is up', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ anonymousPaused: true }, 'test');
    const app = await buildApp({ store, sessionSecret, publicPlaySlugs: 'promo-game' });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json().publicPlaySlugs).toEqual([]);
    await app.close();
  });

  it('says the site is open again once the rung is cleared', async () => {
    const app = await buildApp({ store: new InMemoryStore(), sessionSecret, publicPlaySlugs: 'promo-game' });
    const body = (await app.inject({ method: 'GET', url: '/api/health' })).json();
    expect(body.privateBeta).toBe(false);
    expect(body.publicPlaySlugs).toEqual(['promo-game']);
    await app.close();
  });

  it('never marks a game document publicly cacheable during the incident', async () => {
    const store = new InMemoryStore();
    await store.setCreationLimits({ anonymousPaused: true }, 'test');
    const app = await buildApp({ store, sessionSecret, publicPlaySlugs: 'promo-game' });
    const res = await app.inject({ method: 'GET', url: '/api/games/promo-game' });
    // A cache filled by an operator would outlive the rung.
    expect(res.headers['cache-control']).not.toContain('public');
    await app.close();
  });
});
