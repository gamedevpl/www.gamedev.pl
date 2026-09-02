import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from '../agent-surface/agent-token.js';
import { mintGameAgentKey } from '../agent-surface/agent-game-key.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { cimdSupportsPublicClientAuth, consentToken, OAUTH_AS_METADATA_PATH } from './oauth-as.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { AS_ACCESS_TOKEN_TTL_MS, generateAsAccessToken, generateAsRefreshToken } from './oauth-tokens.js';
import { MCP_ENDPOINT_PATH } from '../agent-surface/self-build-connect.js';
import { InMemoryStore } from './store.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
const MCP_SECRET = 'oauth-as-mcp-secret';

function sessionCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}`;
}

async function buildOAuthApp(store: InMemoryStore) {
  return buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    submissionRoutes: {
      githubClient: {
        getIssueState: async () => ({ state: 'open' as const }),
        findLinkedPR: async () => null,
        createIssueComment: async () => ({ id: 1 }),
        updateIssueBody: async () => {},
        closeIssue: async () => {},
        ensureOpenPullRequest: async () => ({ number: 1 }),
        deleteBranch: async () => {},
        getGameSources: async () => null,
        getGameMedia: async () => null,
        getCatalog: async () => [],
        getProgressNotes: async () => null,
      },
      githubToken: 'gh-token',
      submissionTokenSecret: MCP_SECRET,
      agentChannel: {},
    },
  });
}

async function seedSelfRound(store: InMemoryStore, issue = 42, owner = 'g:creator') {
  await store.createSubmission(issue, owner, 'Comet Courier');
  await store.setSubmissionSlug(issue, 'comet-courier');
  await store.setSubmissionLocale(issue, 'en');
  await store.setRoundBuilder(issue, 'self');
  await store.setSubmissionBrief(issue, { spec: 'Build it.', qa: [] });
  await store.recordJobTransition(issue, {
    to: 'dispatched',
    at: new Date().toISOString(),
    by: 'system',
  });
}

/**
 * Registers a client from its own source IP.
 *
 * `/oauth/register` is rate limited per IP and the whole suite shares 127.0.0.1, so
 * whether a given test got a 201 or a 429 depended on how many registrations ran before
 * it — which is file order, which differs between a local run and CI. That is how a
 * green local suite went red on the runner. Each caller now gets its own bucket.
 */
let registrarIp = 0;

async function registerClient(app: FastifyInstance, redirectUri = 'http://127.0.0.1/callback') {
  registrarIp += 1;
  const res = await app.inject({
    method: 'POST',
    url: '/oauth/register',
    remoteAddress: `10.9.${Math.floor(registrarIp / 250)}.${(registrarIp % 250) + 1}`,
    headers: { 'content-type': 'application/json' },
    payload: {
      redirect_uris: [redirectUri],
      client_name: 'Test Agent',
      token_endpoint_auth_method: 'none',
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().client_id as string;
}

async function authorizeAndExchange(
  app: FastifyInstance,
  clientId: string,
  redirectUri: string,
  verifier: string,
  uid = 'g:creator',
) {
  const challenge = pkceChallengeS256(verifier);
  const approve = await app.inject({
    method: 'POST',
    url: '/oauth/authorize',
    headers: {
      cookie: sessionCookie(uid),
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'mcp',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      action: 'approve',
      consent_token: consentToken({ uid, clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
    }).toString(),
  });
  expect(approve.statusCode).toBe(302);
  const location = approve.headers.location as string;
  const code = new URL(location).searchParams.get('code');
  expect(code).toBeTruthy();

  const tokenRes = await app.inject({
    method: 'POST',
    url: '/oauth/token',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }).toString(),
  });
  expect(tokenRes.statusCode).toBe(200);
  return tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
  };
}

describe('OAuth authorization server (BY-18b)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    if (app) await app.close();
    app = undefined;
  });

  it('serves RFC 8414 metadata', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildOAuthApp(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: OAUTH_AS_METADATA_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      issuer: 'https://www.gamedev.pl',
      authorization_endpoint: 'https://www.gamedev.pl/oauth/authorize',
      token_endpoint: 'https://www.gamedev.pl/oauth/token',
      registration_endpoint: 'https://www.gamedev.pl/oauth/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp'],
      client_id_metadata_document_supported: true,
    });
  });

  it('runs auth-code + PKCE round trip', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier);
    expect(tokens.access_token).toMatch(/^gdpl_oat_/);
    expect(tokens.refresh_token).toMatch(/^gdpl_ort_/);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.scope).toBe('mcp');
  });

  it('sends unauthenticated browsers to studio with oauth_return so login can resume authorize', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    const store = new InMemoryStore();
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const challenge = pkceChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    const authorizePath =
      `/oauth/authorize?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent('http://127.0.0.1/callback')}` +
      `&code_challenge=${challenge}&code_challenge_method=S256`;
    const res = await app.inject({ method: 'GET', url: authorizePath });
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe('https://www.gamedev.pl/studio');
    expect(location.searchParams.get('oauth_return')).toBe(authorizePath);
  });

  it('rejects authorization_code without PKCE verifier', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = pkceChallengeS256(verifier);
    const approve = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'http://127.0.0.1/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
        consent_token: consentToken({ uid: 'g:creator', clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
      }).toString(),
    });
    const code = new URL(approve.headers.location as string).searchParams.get('code');
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: 'http://127.0.0.1/callback',
        client_id: clientId,
        code_verifier: 'wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }).toString(),
    });
    expect(tokenRes.statusCode).toBe(400);
  });

  it('auth codes are single-use', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = pkceChallengeS256(verifier);
    const approve = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'http://127.0.0.1/callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        action: 'approve',
        consent_token: consentToken({ uid: 'g:creator', clientId, codeChallenge: challenge, secret: SESSION_SECRET }),
      }).toString(),
    });
    const code = new URL(approve.headers.location as string).searchParams.get('code')!;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://127.0.0.1/callback',
      client_id: clientId,
      code_verifier: verifier,
    }).toString();
    const first = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: body,
    });
    expect(second.statusCode).toBe(400);
  });

  it('rotates refresh credentials and revokes grant on reuse', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 41, 'g:creator');
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const initial = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier);

    const rotated = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: initial.refresh_token,
      }).toString(),
    });
    expect(rotated.statusCode).toBe(200);
    const nextRefresh = (rotated.json() as { refresh_token: string }).refresh_token;

    const reuse = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: initial.refresh_token,
      }).toString(),
    });
    expect(reuse.statusCode).toBe(400);
    expect((await store.getSubmission(41))?.roundGeneration).toBe(2);

    const afterReuse = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: nextRefresh,
      }).toString(),
    });
    expect(afterReuse.statusCode).toBe(400);
  });

  it('revocation breaks a live grant', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 42, 'g:creator');
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier);

    const revoke = async () =>
      app!.inject({
        method: 'POST',
        url: '/oauth/revoke',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ token: tokens.refresh_token }).toString(),
      });
    await revoke();
    expect((await store.getSubmission(42))?.roundGeneration).toBe(2);

    // RFC 7009 is idempotent; replaying a revoked token must not keep killing new rounds.
    await revoke();
    expect((await store.getSubmission(42))?.roundGeneration).toBe(2);

    const refresh = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }).toString(),
    });
    expect(refresh.statusCode).toBe(400);
  });

  it('rate-limits DCR', async () => {
    app = await buildOAuthApp(new InMemoryStore());
    let lastStatus = 201;
    for (let i = 0; i < 12; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/oauth/register',
        remoteAddress: '203.0.113.50',
        headers: { 'content-type': 'application/json' },
        payload: { redirect_uris: [`http://127.0.0.1/cb${i}`] },
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it('lists and revokes grants for the signed-in creator', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier);

    const list = await app.inject({
      method: 'GET',
      url: '/api/me/oauth-grants',
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect(list.statusCode).toBe(200);
    const grants = list.json() as Array<{ grantId: string; clientLabel: string }>;
    expect(grants.length).toBe(1);
    expect(grants[0]!.clientLabel).toBe('127.0.0.1');

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/me/oauth-grants/${grants[0]!.grantId}`,
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect(del.statusCode).toBe(204);

    const again = await app.inject({
      method: 'GET',
      url: '/api/me/oauth-grants',
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect((again.json() as unknown[]).length).toBe(0);
  });

  it('accepts ChatGPT-shaped CIMD that prefers private_key_jwt but also supports none', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);

    const clientIdUrl = 'https://chatgpt.com/oauth/test-client/client.json';
    const redirectUri = 'https://chatgpt.com/connector/oauth/test-client';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(clientIdUrl);
      return new Response(
        JSON.stringify({
          client_id: clientIdUrl,
          client_name: 'ChatGPT',
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: 'private_key_jwt',
          token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
          jwks_uri: 'https://chatgpt.com/oauth/jwks.json',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const tokens = await authorizeAndExchange(app, clientIdUrl, redirectUri, verifier);
      expect(tokens.access_token).toMatch(/^gdpl_oat_/);
      expect(fetchMock).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('still rejects CIMD clients that cannot use none', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);

    const clientIdUrl = 'https://example.com/oauth/secret-only/client.json';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              client_id: clientIdUrl,
              redirect_uris: ['https://example.com/callback'],
              token_endpoint_auth_method: 'private_key_jwt',
              token_endpoint_auth_methods_supported: ['private_key_jwt'],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    try {
      const challenge = pkceChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        headers: { cookie: sessionCookie('g:creator') },
        query: {
          response_type: 'code',
          client_id: clientIdUrl,
          redirect_uri: 'https://example.com/callback',
          scope: 'mcp',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_client' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('MCP OAuth integration (BY-18b)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  async function mcpInitialize() {
    const res = await app!.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      },
    });
    return String(res.headers['mcp-session-id']);
  }

  it('rejects OAuth Bearer on write tools', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store);
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier, 'g:creator');
    const sessionId = await mcpInitialize();

    const brief = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });
    expect(brief.statusCode).toBe(200);
    const body = brief.json() as { result?: { isError?: boolean; structuredContent?: { error?: string } } };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.error).toMatch(/OAuth access proves your identity only/);
  });

  it('start with OAuth Bearer + slug mints sessionKey for an open self round', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 42, 'g:creator');
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier, 'g:creator');
    const sessionId = await mcpInitialize();

    const started = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { slug: 'comet-courier' } },
      },
    });
    expect(started.statusCode).toBe(200);
    const startedBody = started.json() as { result?: { structuredContent?: { sessionKey?: string; title?: string } } };
    expect(typeof startedBody.result?.structuredContent?.sessionKey).toBe('string');
    expect(startedBody.result?.structuredContent?.title).toBe('Comet Courier');
  });

  // ChatGPT Apps (and other OAuth MCP clients) keep Authorization: Bearer <access>
  // on every tools/call. That must not shadow the sessionKey start() just minted —
  // otherwise the client can create a game, start a round, and then every write
  // tool is refused immediately ("rejected the session key").
  it('honours sessionKey with OAuth access, then invalidates it when the grant is disconnected', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 43, 'g:creator');
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier, 'g:creator');
    const sessionId = await mcpInitialize();

    const started = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { slug: 'comet-courier' } },
      },
    });
    const sessionKey = (started.json() as { result?: { structuredContent?: { sessionKey?: string } } }).result
      ?.structuredContent?.sessionKey;
    expect(typeof sessionKey).toBe('string');

    const brief = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: { sessionKey } },
      },
    });
    expect(brief.statusCode).toBe(200);
    const body = brief.json() as { result?: { isError?: boolean; structuredContent?: { error?: string } } };
    expect(body.result?.isError).not.toBe(true);
    expect(body.result?.structuredContent?.error).toBeUndefined();

    const grants = await app.inject({
      method: 'GET',
      url: '/api/me/oauth-grants',
      headers: { cookie: sessionCookie('g:creator') },
    });
    const grantId = (grants.json() as Array<{ grantId: string }>)[0]!.grantId;
    const disconnected = await app.inject({
      method: 'DELETE',
      url: `/api/me/oauth-grants/${grantId}`,
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect(disconnected.statusCode).toBe(204);
    expect((await store.getSubmission(43))?.roundGeneration).toBe(2);

    const afterDisconnect = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${tokens.access_token}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: { sessionKey } },
      },
    });
    const disconnectedBody = afterDisconnect.json() as {
      result?: { isError?: boolean; structuredContent?: { error?: string } };
    };
    expect(disconnectedBody.result?.isError).toBe(true);
    expect(disconnectedBody.result?.structuredContent?.error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('keeps static round keys working but retires durable per-game keys', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 77, 'g:owner');
    const at = new Date().toISOString();
    await store.ensureGameAgentKey('comet-courier', 'g:owner', at);
    app = await buildOAuthApp(store);
    const sessionId = await mcpInitialize();

    const roundKey = mintAgentToken(77, MCP_SECRET, { roundGeneration: 1 });
    const briefRound = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${roundKey}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });
    expect(briefRound.statusCode).toBe(200);
    expect((briefRound.json() as { result?: { isError?: boolean } }).result?.isError).not.toBe(true);

    const gameKey = mintGameAgentKey(MCP_SECRET, {
      slug: 'comet-courier',
      creatorUid: 'g:owner',
      keyGeneration: 1,
    });
    const started = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId },
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'start', arguments: { key: gameKey } },
      },
    });
    const retired = started.json() as {
      result?: { isError?: boolean; structuredContent?: { error?: string } };
    };
    expect(retired.result?.isError).toBe(true);
    expect(retired.result?.structuredContent?.error).toMatch(/per-game keys are retired/i);
  });

  it('stale round key returns its own reason, not an OAuth challenge', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 88, 'g:owner');
    app = await buildOAuthApp(store);
    const sessionId = await mcpInitialize();
    const stale = mintAgentToken(88, MCP_SECRET, {
      roundGeneration: 1,
      now: Date.parse('2020-01-01T00:00:00.000Z'),
    });
    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${stale}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['www-authenticate']).toBeUndefined();
    const body = res.json() as { result?: { isError?: boolean; structuredContent?: { error?: string } } };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.error).toBe(STALE_AGENT_TOKEN_REASON);
  });
});

describe('oauth token helpers', () => {
  it('expires access credentials on schedule', async () => {
    const store = new InMemoryStore();
    const generated = generateAsAccessToken();
    const grantId = 'grant-1';
    await store.createOAuthGrant({
      grantId,
      clientId: 'client',
      ownerUid: 'g:u',
      scope: 'mcp',
      createdAt: new Date().toISOString(),
      refreshFamilyId: grantId,
      currentRefreshTokenId: generateAsRefreshToken().tokenId,
      currentRefreshHash: 'abc',
      refreshExpiresAt: new Date(Date.now() + AS_ACCESS_TOKEN_TTL_MS).toISOString(),
    });
    await store.createOAuthAccessToken({
      tokenId: generated.tokenId,
      grantId,
      ownerUid: 'g:u',
      secretHash: generated.secretHash,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    const { verifyAsAccessToken } = await import('./oauth-tokens.js');
    expect(await verifyAsAccessToken(store, generated.token, Date.now())).toBeNull();
  });

  // The screen mints durable write access to someone's games, and `sameSite: 'lax'` does
  // not stop a top-level cross-site form POST — so before this, the consent screen could
  // be skipped entirely by a page the creator never saw.
  it('names who is asking, and only accepts a submit that came from its own screen', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator', email: 'creator@example.com' });
    const app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = pkceChallengeS256(verifier);

    const query = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'http://127.0.0.1/callback',
      scope: 'mcp',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    };

    const page = await app.inject({
      method: 'GET',
      url: `/oauth/authorize?${new URLSearchParams(query).toString()}`,
      headers: { cookie: sessionCookie('g:creator') },
    });
    expect(page.statusCode).toBe(200);

    // Two different clients must not produce an identical screen — that is what makes
    // consent informed rather than a formality.
    expect(page.body).toContain('Test Agent');
    expect(page.body).not.toContain('A coding agent is asking');
    expect(page.body).toContain('creator@example.com');
    // It says what the grant permits, and for how long.
    expect(page.body).toMatch(/build rounds on games you own/i);
    expect(page.body).toMatch(/until you revoke it/i);
    // The grant also dies on its own after 90 days of inactivity — refresh rotation only
    // resets that clock. Saying "until you revoke it" alone would be a promise the
    // refresh TTL breaks, which is the same defect as #488's "rotating stops every agent".
    expect(page.body).toMatch(/90 days without connecting/i);
    // The site is dark; a consent page that looks foreign is one nobody can vet.
    expect(page.body).toContain('#0f1418');

    const issued = /name="consent_token" value="([^"]+)"/.exec(page.body);
    expect(issued, 'the screen must issue a token').toBeTruthy();

    const fields = { ...query, action: 'approve' };

    // A submit that never saw the screen is refused.
    const forged = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(fields).toString(),
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toMatchObject({ error: 'invalid_consent' });

    // So is another creator's token — it is bound to the uid, not just to the request.
    const lifted = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        ...fields,
        consent_token: consentToken({
          uid: 'g:someone-else',
          clientId,
          codeChallenge: challenge,
          secret: SESSION_SECRET,
        }),
      }).toString(),
    });
    expect(lifted.statusCode).toBe(403);

    // And the real one is accepted, so this is a gate rather than a wall.
    const accepted = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ ...fields, consent_token: issued![1]! }).toString(),
    });
    expect(accepted.statusCode).toBe(302);
  });

  // Sessions verify against the previous secret during a rotation, so a consent token
  // that did not would 403 a creator who did nothing wrong — on the one screen where a
  // refusal reads like an attack rather than a config change.
  it('still accepts a consent token issued under the previous session secret', async () => {
    const PREV = 'previous-session-secret-value';
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator', email: 'creator@example.com' });
    const app = await buildApp({
      store,
      sessionSecret: SESSION_SECRET,
      sessionSecretPrev: PREV,
      submissionRoutes: {
        githubClient: {
          getIssueState: async () => ({ state: 'open' as const }),
          findLinkedPR: async () => null,
          createIssueComment: async () => ({ id: 1 }),
          updateIssueBody: async () => {},
          closeIssue: async () => {},
          ensureOpenPullRequest: async () => ({ number: 1 }),
          deleteBranch: async () => {},
          getGameSources: async () => null,
          getGameMedia: async () => null,
          getCatalog: async () => [],
          getProgressNotes: async () => null,
        } as never,
        githubToken: 'gh-token',
        submissionTokenSecret: MCP_SECRET,
        agentChannel: {},
      },
    });

    const clientId = await registerClient(app, 'http://127.0.0.1/rotate');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = pkceChallengeS256(verifier);
    const fields = {
      response_type: 'code',
      client_id: clientId,
      redirect_uri: 'http://127.0.0.1/rotate',
      scope: 'mcp',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      action: 'approve',
    };

    // The token the screen handed out before the rotation.
    const beforeRotation = consentToken({ uid: 'g:creator', clientId, codeChallenge: challenge, secret: PREV });
    const accepted = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ ...fields, consent_token: beforeRotation }).toString(),
    });
    expect(accepted.statusCode).toBe(302);

    // A secret that was never ours is still refused — this widens the window, not the gate.
    const foreign = consentToken({ uid: 'g:creator', clientId, codeChallenge: challenge, secret: 'not-our-secret' });
    const refused = await app.inject({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { cookie: sessionCookie('g:creator'), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ ...fields, consent_token: foreign }).toString(),
    });
    expect(refused.statusCode).toBe(403);
    await app.close();
  });
});

describe('cimdSupportsPublicClientAuth', () => {
  it('accepts ChatGPT RP Metadata Choices listing none alongside private_key_jwt', () => {
    expect(
      cimdSupportsPublicClientAuth({
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
      }),
    ).toBe(true);
  });

  it('accepts legacy none-only documents (claude.ai shape)', () => {
    expect(cimdSupportsPublicClientAuth({ token_endpoint_auth_method: 'none' })).toBe(true);
    expect(cimdSupportsPublicClientAuth({})).toBe(true);
  });

  it('rejects clients that only speak private_key_jwt', () => {
    expect(
      cimdSupportsPublicClientAuth({
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
      }),
    ).toBe(false);
    expect(cimdSupportsPublicClientAuth({ token_endpoint_auth_method: 'private_key_jwt' })).toBe(false);
  });
});
