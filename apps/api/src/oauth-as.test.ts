import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { OAUTH_AS_METADATA_PATH } from './oauth-as.js';
import { pkceChallengeS256 } from './oauth-pkce.js';
import { AS_ACCESS_TOKEN_TTL_MS, generateAsAccessToken, generateAsRefreshToken } from './oauth-tokens.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

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
        createIssue: async () => ({ number: 42 }),
        getIssueState: async () => ({ state: 'open' as const }),
        findLinkedPR: async () => null,
        createIssueComment: async () => ({ id: 1 }),
        updateIssueBody: async () => {},
        closeIssue: async () => {},
        closePullRequest: async () => {},
        ensureOpenPullRequest: async () => ({ number: 1 }),
        deleteBranch: async () => {},
        getGameSources: async () => null,
        getGameMedia: async () => null,
        getCatalog: async () => [],
        getProgressNotes: async () => null,
      },
      githubToken: 'gh-token',
      submissionTokenSecret: MCP_SECRET,
      translator: new NoopTranslator(),
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

async function registerClient(app: FastifyInstance, redirectUri = 'http://127.0.0.1/callback') {
  const res = await app.inject({
    method: 'POST',
    url: '/oauth/register',
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
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildOAuthApp(store);
    const clientId = await registerClient(app);
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const tokens = await authorizeAndExchange(app, clientId, 'http://127.0.0.1/callback', verifier);

    await app.inject({
      method: 'POST',
      url: '/oauth/revoke',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ token: tokens.refresh_token }).toString(),
    });

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

  it('static round key, durable game key, and sessionKey still work', async () => {
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
    const sessionKey = (started.json() as { result?: { structuredContent?: { sessionKey?: string } } }).result
      ?.structuredContent?.sessionKey;
    expect(typeof sessionKey).toBe('string');

    const briefSession = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId },
      payload: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: { sessionKey } },
      },
    });
    expect((briefSession.json() as { result?: { isError?: boolean } }).result?.isError).not.toBe(true);
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
});
