import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { DELETED_ACCOUNT_UID, InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

describe('account deletion route', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function setup() {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:leaver', email: 'leave@example.com' });
    await store.createSubmission(1, 'g:leaver', 'Published');
    await store.setSubmissionSlug(1, 'kept-game');
    await store.setSubmissionPublishedAt(1, '2026-08-01T00:00:00.000Z');
    const app = await buildApp({ store, sessionSecret });
    apps.push(app);
    return { store, app };
  }

  it('requires an authenticated browser confirmation', async () => {
    const { app } = await setup();
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/me/account', payload: { confirmation: 'DELETE' } })).statusCode,
    ).toBe(401);

    const invalid = await app.inject({
      method: 'DELETE',
      url: '/api/me/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:leaver', sessionSecret)}` },
      payload: { confirmation: 'no' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('deletes the account, clears the cookie, and reports retained published games', async () => {
    const { store, app } = await setup();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/me/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:leaver', sessionSecret)}` },
      payload: { confirmation: 'DELETE' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      deleted: true,
      publishedGamesKept: ['kept-game'],
      unpublishedGamesRemoved: [],
    });
    expect(response.headers['set-cookie']).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(await store.getUser('g:leaver')).toBeNull();
    expect(await store.getSubmission(1)).toMatchObject({ ownerUid: DELETED_ACCOUNT_UID });
  });
});
