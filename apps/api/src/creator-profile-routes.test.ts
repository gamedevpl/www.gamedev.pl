import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { GamesStore } from './games-store.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

describe('creator profile routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, gamesStore?: GamesStore) {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: gamesStore ? { agentChannel: { gamesStore } } : undefined,
    });
    apps.push(app);
    return app;
  }

  it('claims a handle, edits the profile, and serves the public page', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator', name: 'Secret Google', picture: 'https://g/p.jpg' });
    const app = await appWith(store);

    const claim = await app.inject({
      method: 'POST',
      url: '/api/me/profile/handle',
      headers: { cookie: authCookie('g:creator') },
      payload: { handle: 'ada' },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json()).toMatchObject({
      publishReady: true,
      profile: { handle: 'ada', profileName: 'ada', avatarUrl: 'https://g/p.jpg' },
    });

    const update = await app.inject({
      method: 'PUT',
      url: '/api/me/profile',
      headers: { cookie: authCookie('g:creator') },
      payload: { profileName: 'Ada Lovelace', bio: 'Builds tiny worlds.', avatarMode: 'letter' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().profile).toMatchObject({
      handle: 'ada',
      profileName: 'Ada Lovelace',
      bio: 'Builds tiny worlds.',
      avatarUrl: null,
    });

    await store.createSubmission(42, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(42, 'sky-dodge');
    await store.setSubmissionPublishedAt(42, '2026-08-01T12:00:00.000Z');
    await store.setPublication({
      slug: 'sky-dodge',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: '2026-08-01T12:00:00.000Z',
    });

    const publicPage = await app.inject({ method: 'GET', url: '/api/creators/ada' });
    expect(publicPage.statusCode).toBe(200);
    const body = publicPage.json();
    expect(body.profile.profileName).toBe('Ada Lovelace');
    expect(body.games).toEqual([
      expect.objectContaining({
        slug: 'sky-dodge',
        title: 'Sky Dodge',
        submittedBy: 'Ada Lovelace',
        creatorHandle: 'ada',
      }),
    ]);
    // Never leak the Google account name on the public page.
    expect(JSON.stringify(body)).not.toContain('Secret Google');
  });

  it('reports availability and refuses reserved handles', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:a' });
    await store.upsertUser({ uid: 'g:b' });
    await store.claimHandle('g:a', 'taken_one', '2026-08-01T00:00:00.000Z');
    const app = await appWith(store);

    const reserved = await app.inject({
      method: 'GET',
      url: '/api/creators/admin/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(reserved.json()).toMatchObject({ available: false, reason: 'reserved' });

    const taken = await app.inject({
      method: 'GET',
      url: '/api/creators/taken_one/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(taken.json()).toMatchObject({ available: false, reason: 'taken' });

    const free = await app.inject({
      method: 'GET',
      url: '/api/creators/lovelace/availability',
      headers: { cookie: authCookie('g:b') },
    });
    expect(free.json()).toMatchObject({ available: true });
  });

  it('404s unknown creators', async () => {
    const app = await appWith(new InMemoryStore());
    const response = await app.inject({ method: 'GET', url: '/api/creators/nobody_here' });
    expect(response.statusCode).toBe(404);
  });
});
