import { beforeEach, describe, expect, it } from 'vitest';
import { mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { enableCliSurface, mintCreatorTokens } from './oauth-cli-test-app.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function sessionHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

describe('self-service PAT mint (CL-31)', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
  });

  it('mints for a browser session and never for a PAT or OAuth token', async () => {
    const restore = enableCliSurface();
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:boss',
      submissionRoutes: {
        githubClient: { createIssue: async () => ({ number: 42 }) } as never,
        githubToken: 'gh-token',
        submissionTokenSecret: 'oauth-cli-mcp-secret',
      },
    });
    const minted = await app.inject({
      method: 'POST',
      url: '/api/me/access-tokens',
      headers: sessionHeaders('g:creator'),
      payload: { name: 'ci', expiresInDays: 30 },
    });
    expect(minted.statusCode).toBe(201);
    const body = minted.json() as { token: string; tokenId: string };
    expect(body.token).toMatch(/^gdpl_pat_/);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/me/access-tokens',
      headers: sessionHeaders('g:creator'),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().tokens).toHaveLength(1);

    const viaPat = await app.inject({
      method: 'POST',
      url: '/api/me/access-tokens',
      headers: { authorization: `Bearer ${body.token}` },
      payload: { name: 'nope', expiresInDays: 30 },
    });
    expect(viaPat.statusCode).toBe(404);

    const tokens = await mintCreatorTokens(app, { uid: 'g:creator' });
    const viaOauth = await app.inject({
      method: 'POST',
      url: '/api/me/access-tokens',
      headers: { authorization: `Bearer ${tokens.access_token}` },
      payload: { name: 'nope', expiresInDays: 30 },
    });
    expect(viaOauth.statusCode).toBe(404);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/me/access-tokens/${body.tokenId}`,
      headers: sessionHeaders('g:creator'),
    });
    expect(revoked.statusCode).toBe(200);
    restore();
  });

  it('does not let one account revoke another account token by id', async () => {
    const app = await buildApp({ store, sessionSecret });
    await store.upsertUser({ uid: 'g:other' });
    const { record } = await mintAccessTokenFor(store, {
      uid: 'g:other',
      name: 'theirs',
      createdByUid: 'g:boss',
      nowMs: Date.now(),
    });
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/me/access-tokens/${record.tokenId}`,
      headers: sessionHeaders('g:creator'),
    });
    expect(res.statusCode).toBe(404);
  });
});
