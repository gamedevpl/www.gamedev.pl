import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentToken, OAUTH_AS_METADATA_PATH } from './oauth-as.js';
import { GAMEDEV_CLI_CLIENT_ID } from './oauth-first-party.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { MAX_OAUTH_GRANTS_PER_UID, OAUTH_GRANT_CAP_DESCRIPTION } from './oauth-scopes.js';
import { MCP_ENDPOINT_PATH } from '../agent-surface/self-build-connect.js';
import {
  buildOAuthApp,
  CLI_LOOPBACK,
  CLI_VERIFIER,
  enableCliSurface,
  mintCreatorTokens,
  seedSelfRound,
  SESSION_SECRET,
  sessionCookie,
} from './oauth-cli-test-app.js';
import { InMemoryStore } from './store.js';

describe('OAuth creator scope (CL-04..CL-07, CL-09)', () => {
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

  async function signedInBoss(): Promise<{ store: InMemoryStore; token: string; cookie: string }> {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    app = await buildOAuthApp(store);
    const tokens = await mintCreatorTokens(app, { uid: 'g:boss', device: 'studio-mac' });
    return { store, token: tokens.access_token, cookie: sessionCookie('g:boss') };
  }

  it('advertises creator scope and device grant when the surface is on', async () => {
    app = await buildOAuthApp(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: OAUTH_AS_METADATA_PATH });
    expect(res.json()).toMatchObject({
      scopes_supported: ['mcp', 'creator'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    });
    expect(res.json().device_authorization_endpoint).toMatch(/\/oauth\/device$/);
  });

  it('loopback creator token authenticates profile and shelf, and lists a device label', async () => {
    const { store, token, cookie } = await signedInBoss();
    const bearer = { authorization: `Bearer ${token}` };

    const profile = await app!.inject({ method: 'GET', url: '/api/me/profile', headers: bearer });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().profile ?? profile.json()).toBeTruthy();

    const mine = await app!.inject({ method: 'GET', url: '/api/submissions/mine', headers: bearer });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().submissions).toEqual([]);

    const grants = await app!.inject({ method: 'GET', url: '/api/me/oauth-grants', headers: { cookie } });
    expect(grants.statusCode).toBe(200);
    expect(grants.json()).toEqual([
      expect.objectContaining({
        clientId: GAMEDEV_CLI_CLIENT_ID,
        clientLabel: 'gamedevpl CLI on studio-mac',
      }),
    ]);
    expect(await store.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);
  });

  it('consent copy names the creator scope', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss', email: 'boss@example.com' });
    app = await buildOAuthApp(store);
    const page = await app.inject({
      method: 'GET',
      url:
        `/oauth/authorize?response_type=code&client_id=${GAMEDEV_CLI_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent('http://127.0.0.1:43721/callback')}` +
        `&scope=creator&code_challenge=abc&code_challenge_method=S256&device=studio-mac`,
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('manage your games and profile on gamedev.pl');
    expect(page.body).toContain('name="device"');
    expect(page.body).toContain('studio-mac');
  });

  it.each([
    ['POST', '/api/admin/jobs/1000001/publish'],
    ['POST', '/api/admin/games/comet-courier/delete'],
    ['DELETE', '/api/me/account'],
    ['POST', '/api/beta-invites/claim'],
  ] as const)('%s %s answers 404 for a creator token', async (method, url) => {
    const { token } = await signedInBoss();
    const res = await app!.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: method === 'DELETE' ? { confirmation: 'DELETE' } : { code: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('revoking the grant in Studio kills the token on the next request', async () => {
    const { token, cookie } = await signedInBoss();
    const listed = await app!.inject({ method: 'GET', url: '/api/me/oauth-grants', headers: { cookie } });
    const grantId = (listed.json() as Array<{ grantId: string }>)[0]!.grantId;
    const revoked = await app!.inject({
      method: 'DELETE',
      url: `/api/me/oauth-grants/${grantId}`,
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(204);
    const profile = await app!.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.statusCode).toBe(401);
  });

  it('mcp-only token does not authenticate class-A routes', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const tokens = await mintCreatorTokens(app, { uid: 'g:boss', scope: 'mcp' });
    const profile = await app.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(profile.statusCode).toBe(401);
  });

  it('creator-only token cannot start an MCP session', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await seedSelfRound(store, 42, 'g:creator');
    app = await buildOAuthApp(store);
    const tokens = await mintCreatorTokens(app, { uid: 'g:creator' });
    const init = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
    });
    const started = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': String(init.headers['mcp-session-id']),
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { slug: 'comet-courier' } },
      },
    });
    const body = started.json() as { result?: { isError?: boolean } };
    expect(body.result?.isError).toBe(true);
  });

  it('refuses creator scope when CLI_SURFACE is off', async () => {
    restore?.();
    delete process.env.CLI_SURFACE;
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const res = await app.inject({
      method: 'GET',
      url:
        `/oauth/authorize?response_type=code&client_id=${GAMEDEV_CLI_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent('http://127.0.0.1:43721/callback')}` +
        `&scope=creator&code_challenge=abc&code_challenge_method=S256`,
      headers: { cookie: sessionCookie('g:boss') },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_scope' });
  });

  it('refresh reuse on a creator-only grant does not bump self-round generation', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await seedSelfRound(store, 41, 'g:creator');
    app = await buildOAuthApp(store);
    const initial = await mintCreatorTokens(app, { uid: 'g:creator' });
    const rotated = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: initial.refresh_token }).toString(),
    });
    expect(rotated.statusCode).toBe(200);
    const reuse = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: initial.refresh_token }).toString(),
    });
    expect(reuse.statusCode).toBe(400);
    expect((await store.getSubmission(41))?.roundGeneration).toBe(1);
  });

  it('does not persist a grant until the code is exchanged', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const challenge = pkceChallengeS256(CLI_VERIFIER);
    const approve = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: GAMEDEV_CLI_CLIENT_ID,
        redirect_uri: CLI_LOOPBACK,
        scope: 'creator',
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
        consent_token: consentToken({
          uid: 'g:boss',
          clientId: GAMEDEV_CLI_CLIENT_ID,
          codeChallenge: challenge,
          secret: SESSION_SECRET,
        }),
      }).toString(),
    });
    expect(approve.statusCode).toBe(302);
    expect(new URL(approve.headers.location as string).searchParams.get('code')).toBeTruthy();
    expect(await store.listOAuthGrantsByOwner('g:boss')).toHaveLength(0);
  });

  it('reuses the CLI grant when the same device signs in again', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const first = await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2' });
    const rotated = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: first.refresh_token,
      }).toString(),
    });
    expect(rotated.statusCode).toBe(200);
    const rotatedRefresh = (rotated.json() as { refresh_token: string }).refresh_token;

    const second = await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2' });
    expect(first.access_token).toBeTruthy();
    expect(second.access_token).toBeTruthy();
    expect(await store.listOAuthGrantsByOwner('g:boss')).toHaveLength(1);

    for (const refresh of [first.refresh_token, rotatedRefresh]) {
      const stale = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }).toString(),
      });
      expect(stale.statusCode).toBe(400);
    }

    const profile = await app.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${second.access_token}` },
    });
    expect(profile.statusCode).toBe(200);
  });

  it('replaces a reused grant scope with the newly approved one', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    const broad = await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2', scope: 'mcp creator' });
    expect(broad.scope).toBe('mcp creator');
    const second = await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2', scope: 'creator' });
    expect(second.scope).toBe('creator');
    expect((await store.listOAuthGrantsByOwner('g:boss'))[0]?.scope).toBe('creator');
    const profile = await app.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${second.access_token}` },
    });
    expect(profile.statusCode).toBe(200);
  });

  it('does not consume a grant slot on same-device relogin at the cap', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    for (let i = 0; i < MAX_OAUTH_GRANTS_PER_UID - 1; i += 1) {
      await mintCreatorTokens(app, { uid: 'g:boss', device: `dev-${i}` });
    }
    await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2' });
    const again = await mintCreatorTokens(app, { uid: 'g:boss', device: 'sputnik-2' });
    expect(again.access_token).toBeTruthy();
    expect((await store.listOAuthGrantsByOwner('g:boss')).length).toBe(MAX_OAUTH_GRANTS_PER_UID);
  });

  it('caps grants per account', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    app = await buildOAuthApp(store);
    for (let i = 0; i < MAX_OAUTH_GRANTS_PER_UID; i += 1) {
      await mintCreatorTokens(app, { uid: 'g:boss', device: `dev-${i}` });
    }
    const challenge = pkceChallengeS256(CLI_VERIFIER);
    const denied = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:boss'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: GAMEDEV_CLI_CLIENT_ID,
        redirect_uri: CLI_LOOPBACK,
        scope: 'creator',
        state: 'xyz',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
        device: 'one-too-many',
        consent_token: consentToken({
          uid: 'g:boss',
          clientId: GAMEDEV_CLI_CLIENT_ID,
          codeChallenge: challenge,
          secret: SESSION_SECRET,
        }),
      }).toString(),
    });
    expect(denied.statusCode).toBe(302);
    const location = new URL(denied.headers.location as string);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('error_description')).toBe(OAUTH_GRANT_CAP_DESCRIPTION);
    expect((await store.listOAuthGrantsByOwner('g:boss')).length).toBe(MAX_OAUTH_GRANTS_PER_UID);
  });

  it('rejects a creator OAuth token after deletion is scheduled', async () => {
    const { store, token } = await signedInBoss();
    await store.scheduleAccountDeletion('g:boss', '2026-08-28T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    const profile = await app!.inject({
      method: 'GET',
      url: '/api/me/profile',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.statusCode).toBe(401);
  });

  it('rate-limits the token endpoint per IP', async () => {
    app = await buildOAuthApp(new InMemoryStore());
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    const payload = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'gdpl_ort_x' }).toString();
    let last = 400;
    for (let i = 0; i < 61; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        remoteAddress: '203.0.113.9',
        headers,
        payload,
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});
