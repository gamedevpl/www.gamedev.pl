import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { consentToken } from './oauth-as.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { InMemoryStore } from './store.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
const UID = 'g:creator';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

function sessionCookie(source?: 'token'): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(UID, SESSION_SECRET, undefined, undefined, source)}`;
}

describe('OAuth consent session authentication', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
  });

  it.each([
    ['PAT-derived', 'free', 'token' as const],
    ['blocked', 'blocked', undefined],
  ])('refuses a %s session', async (_label, tier, source) => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: UID, tier });
    app = await buildApp({ store, sessionSecret: SESSION_SECRET });

    const registration = await app.inject({
      method: 'POST',
      url: '/oauth/register',
      remoteAddress: `10.10.0.${source ? 1 : 2}`,
      payload: {
        redirect_uris: ['http://127.0.0.1/callback'],
        token_endpoint_auth_method: 'none',
      },
    });
    expect(registration.statusCode).toBe(201);
    const clientId = (registration.json() as { client_id: string }).client_id;
    const challenge = pkceChallengeS256(VERIFIER);

    const approve = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: {
        cookie: sessionCookie(source),
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'http://127.0.0.1/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
        consent_token: consentToken({ uid: UID, clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
      }).toString(),
    });

    expect(approve.statusCode).toBe(401);
    expect(approve.json()).toEqual({ error: 'login_required' });
  });

  it.each([
    ['PAT-derived', 'token' as const, true],
    ['human', undefined, undefined],
  ])('tells the client whether a %s cookie can approve', async (_label, source, flag) => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: UID, tier: 'standard' });
    app = await buildApp({ store, sessionSecret: SESSION_SECRET });
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: sessionCookie(source) } });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { tokenSession?: boolean } }).user.tokenSession).toBe(flag);
  });
});
