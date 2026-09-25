import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintAccessTokenFor } from './access-token-service.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { consentToken } from './oauth-as.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { verifyAsAccessToken } from './oauth-tokens.js';
import { InMemoryStore } from './store.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
const UID = 'g:creator';
const ADMIN = 'g:boss';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const REDIRECT = 'http://127.0.0.1/callback';
const DAY_MS = 24 * 60 * 60 * 1000;

let ipSuffix = 0;

function cookie(uid: string, tokenId?: string): string {
  const source = tokenId === undefined ? undefined : ('token' as const);
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET, undefined, undefined, source, tokenId || undefined)}`;
}

async function setup(tier: 'standard' | 'blocked' = 'standard') {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: UID, tier });
  await store.upsertUser({ uid: ADMIN });
  const app = await buildApp({ store, sessionSecret: SESSION_SECRET, adminUids: ADMIN });
  return { store, app };
}

async function mintPat(store: InMemoryStore, nowMs = Date.now(), expiresInDays = 30) {
  const { token, record } = await mintAccessTokenFor(store, {
    uid: UID,
    name: 'reviewer',
    createdByUid: ADMIN,
    expiresInDays,
    nowMs,
  });
  return { token, tokenId: record.tokenId };
}

async function register(app: FastifyInstance): Promise<string> {
  ipSuffix += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/oauth/register',
    remoteAddress: `10.20.0.${ipSuffix}`,
    payload: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { client_id: string }).client_id;
}

async function approve(app: FastifyInstance, clientId: string, sessionCookie: string) {
  const challenge = pkceChallengeS256(VERIFIER);
  return app.inject({
    method: 'POST',
    url: '/oauth/authorize',
    headers: { cookie: sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      action: 'approve',
      consent_token: consentToken({ uid: UID, clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
    }).toString(),
  });
}

async function tokenCall(app: FastifyInstance, fields: Record<string, string>) {
  return app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });
}

async function approveAndExchange(app: FastifyInstance, sessionCookie: string) {
  const clientId = await register(app);
  const approved = await approve(app, clientId, sessionCookie);
  expect(approved.statusCode).toBe(302);
  const code = new URL(approved.headers.location as string).searchParams.get('code') ?? '';
  const exchanged = await tokenCall(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: VERIFIER,
  });
  expect(exchanged.statusCode).toBe(200);
  return exchanged.json() as { access_token: string; refresh_token: string };
}

describe('OAuth consent session authentication', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('leaves a Google or Apple session grant unbound', async () => {
    const env = await setup();
    app = env.app;
    await approveAndExchange(app, cookie(UID));
    const [grant] = await env.store.listOAuthGrantsByOwner(UID);
    expect(grant?.viaTokenId).toBeUndefined();
    expect(grant?.viaTokenExpiresAt).toBeUndefined();
  });

  it('binds a grant approved from a PAT session to that PAT', async () => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store);
    const tokens = await approveAndExchange(app, cookie(UID, tokenId));
    const [grant] = await env.store.listOAuthGrantsByOwner(UID);
    expect(grant?.viaTokenId).toBe(tokenId);
    expect(await verifyAsAccessToken(env.store, tokens.access_token)).not.toBeNull();
    const refreshed = await tokenCall(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect(refreshed.statusCode).toBe(200);
  });

  it('kills the bound grant when the PAT is revoked', async () => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store);
    const tokens = await approveAndExchange(app, cookie(UID, tokenId));
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/admin/access-tokens/${tokenId}`,
      headers: { cookie: cookie(ADMIN) },
    });
    expect(revoked.statusCode).toBe(200);
    expect(await env.store.listOAuthGrantsByOwner(UID)).toEqual([]);
    expect(await verifyAsAccessToken(env.store, tokens.access_token)).toBeNull();
    const refreshed = await tokenCall(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect(refreshed.json()).toEqual({ error: 'invalid_grant' });
  });

  it('refuses refresh and revokes the grant when the PAT vanished another way', async () => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store);
    const tokens = await approveAndExchange(app, cookie(UID, tokenId));
    await env.store.deleteAccessToken(tokenId);
    const refreshed = await tokenCall(app, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    expect(refreshed.json()).toEqual({ error: 'invalid_grant' });
    expect(await env.store.listOAuthGrantsByOwner(UID)).toEqual([]);
  });

  it('rejects access tokens once the bound PAT expires', async () => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store, Date.now(), 1);
    const tokens = await approveAndExchange(app, cookie(UID, tokenId));
    expect(await verifyAsAccessToken(env.store, tokens.access_token, Date.now() + 2 * DAY_MS)).toBeNull();
  });

  it('refuses an expired PAT', async () => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store, Date.now() - 2 * DAY_MS, 1);
    const approved = await approve(app, await register(app), cookie(UID, tokenId));
    expect(approved.statusCode).toBe(401);
    expect(approved.json()).toEqual({ error: 'login_required' });
  });

  it('refuses a PAT cookie that names no token', async () => {
    const env = await setup();
    app = env.app;
    const approved = await approve(app, await register(app), cookie(UID, ''));
    expect(approved.statusCode).toBe(401);
  });

  it.each([
    ['Google or Apple', false],
    ['PAT', true],
  ])('refuses a blocked account on a %s session', async (_label, viaPat) => {
    const env = await setup();
    app = env.app;
    const { tokenId } = await mintPat(env.store);
    await env.store.upsertUser({ uid: UID, tier: 'blocked' });
    const approved = await approve(app, await register(app), cookie(UID, viaPat ? tokenId : undefined));
    expect(approved.statusCode).toBe(401);
    expect(await env.store.listOAuthGrantsByOwner(UID)).toEqual([]);
  });
});
