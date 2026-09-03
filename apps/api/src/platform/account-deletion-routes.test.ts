import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { LEGACY_SESSION_COOKIE_NAME, mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { InternalAuthVerifier } from './internal-auth.js';
import { DELETED_ACCOUNT_UID, InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';
const now = Date.parse('2026-08-04T00:00:00.000Z');

const allowInternal: InternalAuthVerifier = { verify: async () => true };

describe('account deletion routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function setup(options: { adminUids?: string; internalAuthVerifier?: InternalAuthVerifier } = {}) {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:leaver', email: 'leave@example.com' });
    await store.createSubmission(1, 'g:leaver', 'Published');
    await store.setSubmissionSlug(1, 'kept-game');
    await store.setSubmissionPublishedAt(1, '2026-08-01T00:00:00.000Z');
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: options.adminUids,
      accountDeletionRoutes: {
        now: () => now,
        internalAuthVerifier: options.internalAuthVerifier ?? { verify: async () => false },
      },
    });
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

  it('schedules deletion for 14 days later without removing data immediately', async () => {
    const { store, app } = await setup();
    const cookie = `${SESSION_COOKIE_NAME}=${mintSessionToken('g:leaver', sessionSecret)}`;
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/me/account',
      headers: { cookie },
      payload: { confirmation: 'DELETE' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ scheduled: true, deleteAfter: '2026-08-18T00:00:00.000Z' });
    const cleared = [response.headers['set-cookie'] ?? []].flat().join('\n');
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
    // The old name still authenticates, so deletion must clear it too.
    expect(cleared).toContain(`${LEGACY_SESSION_COOKIE_NAME}=;`);
    expect(await store.getUser('g:leaver')).toMatchObject({
      deletionRequestedAt: '2026-08-04T00:00:00.000Z',
      deletionScheduledFor: '2026-08-18T00:00:00.000Z',
    });
    expect(await store.getSubmission(1)).toMatchObject({ ownerUid: 'g:leaver' });

    const staleSession = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(staleSession.statusCode).toBe(401);
  });

  it('requires an operator to be demoted before scheduling deletion', async () => {
    const { store, app } = await setup({ adminUids: 'g:leaver' });
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/me/account',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:leaver', sessionSecret)}` },
      payload: { confirmation: 'DELETE' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'operator accounts must be demoted before deletion' });
    expect((await store.getUser('g:leaver'))?.deletionScheduledFor).toBeUndefined();
  });

  it('hard-deletes due accounts only when the authenticated sweep runs', async () => {
    const { store, app } = await setup({ internalAuthVerifier: allowInternal });
    await store.scheduleAccountDeletion('g:leaver', '2026-07-01T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

    expect((await app.inject({ method: 'POST', url: '/api/internal/account-deletion-sweep' })).statusCode).toBe(200);
    expect(await store.getUser('g:leaver')).toBeNull();
    expect(await store.getSubmission(1)).toMatchObject({ ownerUid: DELETED_ACCOUNT_UID });
  });
});
