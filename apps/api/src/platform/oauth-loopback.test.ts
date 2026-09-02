import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { redirectUriMatches } from './oauth-redirect.js';
import {
  buildOAuthApp,
  CLI_VERIFIER,
  enableCliSurface,
  mintCreatorTokens,
  sessionCookie,
} from './oauth-cli-test-app.js';
import { InMemoryStore } from './store.js';

describe('OAuth loopback redirects (CL-05)', () => {
  let app: FastifyInstance | undefined;
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = enableCliSurface();
  });

  afterEach(async () => {
    restore?.();
    restore = undefined;
    if (app) await app.close();
    app = undefined;
  });

  it('treats [::1] as port-agnostic loopback and does not cross-match 127.0.0.1', () => {
    expect(redirectUriMatches('http://[::1]:9999/callback', 'http://[::1]/callback')).toBe(true);
    expect(redirectUriMatches('http://[::1]:1/callback', 'http://[::1]:65535/callback')).toBe(true);
    expect(redirectUriMatches('http://127.0.0.1:8080/callback', 'http://[::1]/callback')).toBe(false);
    expect(redirectUriMatches('http://[::1]:8080/callback', 'http://127.0.0.1/callback')).toBe(false);
    expect(redirectUriMatches('http://localhost:8080/callback', 'http://[::1]/callback')).toBe(false);
  });

  it('exchanges a first-party loopback on [::1] with PKCE and no client secret', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const tokens = await mintCreatorTokens(app, {
      uid: 'g:boss',
      redirectUri: 'http://[::1]:9432/callback',
    });
    expect(tokens.access_token).toMatch(/^gdpl_oat_/);
    expect(tokens.scope).toBe('creator');
    const profile = await app.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(profile.statusCode).toBe(200);
  });

  it('rejects a non-loopback redirect on the first-party client', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const res = await app.inject({
      method: 'GET',
      url:
        `/oauth/authorize?response_type=code&client_id=${GAMEDEV_CLI_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent('https://evil.test/callback')}` +
        `&scope=creator&code_challenge=${CLI_VERIFIER}&code_challenge_method=S256`,
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_redirect_uri' });
  });

  it('requires PKCE S256', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const res = await app.inject({
      method: 'GET',
      url:
        `/oauth/authorize?response_type=code&client_id=${GAMEDEV_CLI_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent('http://127.0.0.1:9/callback')}&scope=creator`,
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_request' });
  });
});
