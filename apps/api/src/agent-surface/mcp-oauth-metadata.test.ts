import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintAgentToken, STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import {
  buildMcpOAuthAuthenticateHeader,
  buildOAuthProtectedResourceDocument,
  MCP_NO_ACCOUNT_HINT,
  MCP_MISSING_CREDENTIAL_HINT,
  mcpMissingCredentialHint,
  OAUTH_PROTECTED_RESOURCE_PATH,
  oauthProtectedResourceMetadataUrl,
  oauthProtectedResourcePathForMcp,
} from './mcp-oauth-metadata.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { InMemoryStore } from '../platform/store.js';

describe('canonicalAppBaseUrl / oauth metadata helpers', () => {
  const envKeys = [
    'CANONICAL_HOST',
    'APP_BASE_URL',
    'MCP_AUTHORIZATION_SERVERS',
    'MCP_RESOURCE_DOCUMENTATION_URL',
  ] as const;

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it('prefers CANONICAL_HOST over APP_BASE_URL for metadata URLs', () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    process.env.APP_BASE_URL = 'https://evil.test';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`);
    expect(buildMcpOAuthAuthenticateHeader()).toBe(
      `Bearer resource_metadata="https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}"`,
    );
  });

  it('falls back to APP_BASE_URL when CANONICAL_HOST is unset', () => {
    process.env.APP_BASE_URL = 'https://staging.gamedev.pl';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://staging.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`);
  });

  // These values reach clients inside a WWW-Authenticate challenge, so a misconfigured
  // env must not turn into a metadata URL that resolves nowhere.
  it('reduces a CANONICAL_HOST carrying a path to its origin', () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl/some/path';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`);
  });

  it('reduces an APP_BASE_URL carrying a path and query to its origin', () => {
    process.env.APP_BASE_URL = 'https://staging.gamedev.pl/base?tenant=1#frag';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://staging.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`);
  });

  it('keeps an explicit port', () => {
    process.env.CANONICAL_HOST = 'localhost:5173';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://localhost:5173${OAUTH_PROTECTED_RESOURCE_PATH}`);
  });

  it('falls through to the next source when a value is not a URL at all', () => {
    process.env.CANONICAL_HOST = 'http://';
    process.env.APP_BASE_URL = 'https://staging.gamedev.pl';
    expect(oauthProtectedResourceMetadataUrl()).toBe(`https://staging.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`);
  });

  it('omits authorization_servers when MCP_AUTHORIZATION_SERVERS is unset', () => {
    delete process.env.MCP_AUTHORIZATION_SERVERS;
    const doc = buildOAuthProtectedResourceDocument();
    expect(doc).toMatchObject({
      resource: `https://www.gamedev.pl${MCP_ENDPOINT_PATH}`,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://www.gamedev.pl/studio',
    });
    expect(doc).not.toHaveProperty('authorization_servers');
  });

  it('includes authorization_servers when MCP_AUTHORIZATION_SERVERS is set', () => {
    process.env.MCP_AUTHORIZATION_SERVERS = 'https://auth.example.com, https://auth2.example.com';
    const doc = buildOAuthProtectedResourceDocument();
    expect(doc.authorization_servers).toEqual(['https://auth.example.com', 'https://auth2.example.com']);
  });
});

describe('GET /.well-known/oauth-protected-resource (BY-18a)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    delete process.env.APP_BASE_URL;
    delete process.env.MCP_AUTHORIZATION_SERVERS;
    if (app) await app.close();
    app = undefined;
  });

  it('serves the metadata document unauthenticated with cache headers', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const res = await app.inject({ method: 'GET', url: OAUTH_PROTECTED_RESOURCE_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.json()).toEqual({
      resource: `https://www.gamedev.pl${MCP_ENDPOINT_PATH}`,
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://www.gamedev.pl/studio',
    });
  });

  it('ignores a spoofed Host header when building absolute URLs', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const res = await app.inject({
      method: 'GET',
      url: OAUTH_PROTECTED_RESOURCE_PATH,
      headers: { host: 'evil.test' },
    });
    expect(res.json().resource).toBe(`https://www.gamedev.pl${MCP_ENDPOINT_PATH}`);
  });

  it('reaches the metadata route through the private-beta wall without a site session', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildApp({
      store: new InMemoryStore(),
      betaAllowedUids: 'g:anyone',
      sessionSecret: 'dev-session-secret-change-me',
    });
    const res = await app.inject({ method: 'GET', url: OAUTH_PROTECTED_RESOURCE_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.json().resource).toBe(`https://www.gamedev.pl${MCP_ENDPOINT_PATH}`);
  });

  it('serves the same document at the RFC 9728 path-suffixed URL clients probe first', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    process.env.MCP_AUTHORIZATION_SERVERS = 'https://www.gamedev.pl';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const path = oauthProtectedResourcePathForMcp();
    expect(path).toBe('/.well-known/oauth-protected-resource/api/mcp');
    const res = await app.inject({ method: 'GET', url: path });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(buildOAuthProtectedResourceDocument());
  });
});

describe('MCP OAuth 401 challenge (BY-18a)', () => {
  const secret = 'oauth-challenge-secret';
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    delete process.env.APP_BASE_URL;
    if (app) await app.close();
    app = undefined;
  });

  async function buildMcpApp(store: InMemoryStore) {
    return buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
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
        submissionTokenSecret: secret,
        agentChannel: {},
      },
    });
  }

  async function seedJob(store: InMemoryStore) {
    await store.createSubmission(42, 'g:owner', 'Comet Courier');
    await store.setSubmissionSlug(42, 'comet-courier');
    await store.setSubmissionLocale(42, 'en');
    await store.setRoundBuilder(42, 'self');
    await store.setSubmissionBrief(42, { spec: 'Build it.', qa: [] });
  }

  it('returns 401 with a canonical resource_metadata URL for unauthenticated tools/call', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildMcpApp(store);

    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        host: 'evil.test',
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}"`,
    );
    // The challenge replaced a tool error that told the agent what to do; a status code
    // is not an instruction, so the sentence has to survive the change.
    expect(res.json()).toEqual({
      error: 'authentication required',
      hint: MCP_MISSING_CREDENTIAL_HINT,
    });
    expect(MCP_MISSING_CREDENTIAL_HINT).toMatch(/sessionKey from start\(\)/);
  });

  it('names the account requirement in the 401 hint, so a visitor is not sent hunting for a key that cannot exist', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    const store = new InMemoryStore();
    await seedJob(store);
    // Passing an allowlist is what buildApp reads as "private beta is on".
    app = await buildApp({
      store,
      betaAllowedUids: 'g:someone-else',
      sessionSecret: 'dev-session-secret-change-me',
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
        submissionTokenSecret: secret,
        agentChannel: {},
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: { 'content-type': 'application/json' },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });

    expect(res.statusCode).toBe(401);
    // The original instruction survives — an account holder who merely dropped sessionKey
    // still needs it — and the account sentence is added, not substituted.
    expect(res.json().hint).toContain(MCP_MISSING_CREDENTIAL_HINT);
    expect(res.json().hint).toContain(MCP_NO_ACCOUNT_HINT);
    expect(res.json().hint).toMatch(/creator account/i);
    expect(res.json().hint).not.toMatch(/beta|waitlist/i);
  });

  it('says nothing about accounts when the site is open', () => {
    expect(mcpMissingCredentialHint(false)).toBe(MCP_MISSING_CREDENTIAL_HINT);
    expect(mcpMissingCredentialHint(false)).not.toMatch(/beta|approved creator account/i);
  });

  it('returns 401 for unauthenticated GET /api/mcp', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildMcpApp(new InMemoryStore());
    const res = await app.inject({ method: 'GET', url: MCP_ENDPOINT_PATH, headers: { host: 'evil.test' } });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata="https://www.gamedev.pl');
    expect(res.headers['www-authenticate']).not.toContain('evil.test');
  });
});

describe('MCP OAuth challenge regressions (BY-18a)', () => {
  const secret = 'oauth-regression-secret';
  const ISSUE = 77;
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  async function buildMcpApp(store: InMemoryStore) {
    return buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {
          createIssue: async () => ({ number: ISSUE }),
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
        submissionTokenSecret: secret,
        agentChannel: {},
      },
    });
  }

  async function seedJob(store: InMemoryStore) {
    await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
    await store.setSubmissionSlug(ISSUE, 'comet-courier');
    await store.setSubmissionLocale(ISSUE, 'en');
    await store.setRoundBuilder(ISSUE, 'self');
    await store.setSubmissionBrief(ISSUE, { spec: 'Build it.', qa: [] });
    await store.recordJobTransition(ISSUE, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });
  }

  async function initialize(app: FastifyInstance) {
    const res = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      // Any Bearer shape clears the handshake challenge.
      headers: { 'content-type': 'application/json', authorization: 'Bearer handshake' },
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

  it('does not challenge valid Bearer round-key or stale-key tool calls', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    app = await buildMcpApp(store);
    const sessionId = await initialize(app);
    const roundKey = mintAgentToken(ISSUE, secret, { roundGeneration: 1 });

    const brief = await app.inject({
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
    expect(brief.statusCode).toBe(200);
    expect(brief.headers['www-authenticate']).toBeUndefined();
    const briefBody = brief.json() as { result?: { isError?: boolean; structuredContent?: { title?: string } } };
    expect(briefBody.result?.isError).not.toBe(true);
    expect(briefBody.result?.structuredContent).toMatchObject({ title: 'Comet Courier' });

    const stale = mintAgentToken(ISSUE, secret, { roundGeneration: 1, now: Date.parse('2020-01-01T00:00:00.000Z') });
    const refused = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${stale}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: {} },
      },
    });
    expect(refused.statusCode).toBe(200);
    expect(refused.headers['www-authenticate']).toBeUndefined();
    const refusedBody = refused.json() as { result?: { isError?: boolean; structuredContent?: { error?: string } } };
    expect(refusedBody.result?.isError).toBe(true);
    expect(refusedBody.result?.structuredContent?.error).toBe(STALE_AGENT_TOKEN_REASON);
  });

  it('does not issue an OAuth challenge for a retired game key or a valid sessionKey', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const at = new Date().toISOString();
    await store.ensureGameAgentKey('comet-courier', 'g:owner', at);
    app = await buildMcpApp(store);
    const sessionId = await initialize(app);

    const gameKey = mintGameAgentKey(secret, {
      slug: 'comet-courier',
      creatorUid: 'g:owner',
      keyGeneration: 1,
    });
    const started = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { key: gameKey } },
      },
    });
    expect(started.statusCode).toBe(200);
    expect(started.headers['www-authenticate']).toBeUndefined();
    const startedBody = started.json() as {
      result?: { isError?: boolean; structuredContent?: { error?: string } };
    };
    expect(startedBody.result?.isError).toBe(true);
    expect(startedBody.result?.structuredContent?.error).toMatch(/per-game keys are retired/i);

    const sessionKey = mintMcpSessionKey(secret, {
      sessionId,
      jobId: ISSUE,
      roundGeneration: 1,
    });

    const brief = await app.inject({
      method: 'POST',
      url: MCP_ENDPOINT_PATH,
      headers: {
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
      },
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_brief', arguments: { sessionKey } },
      },
    });
    expect(brief.statusCode).toBe(200);
    expect(brief.headers['www-authenticate']).toBeUndefined();
    const briefBody = brief.json() as { result?: { isError?: boolean; structuredContent?: { title?: string } } };
    expect(briefBody.result?.isError).not.toBe(true);
    expect(briefBody.result?.structuredContent).toMatchObject({ title: 'Comet Courier' });
  });
});
