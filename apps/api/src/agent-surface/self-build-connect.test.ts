import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCreatorAgentKeyActive,
  DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import { mintGameAgentKey, verifyGameAgentKey } from './agent-game-key.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import {
  assertInstallLinksHaveNoCredentials,
  decodeCursorInstallConfig,
  decodeVscodeInstallConfig,
} from './mcp-install-links.js';
import {
  buildInstallSnippets,
  buildKickoffPrompt,
  mcpEndpointUrl,
  mintConnectPayload,
  mintGameKeyKickoff,
  MCP_ENDPOINT_PATH,
} from './self-build-connect.js';
import { InMemoryStore } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';

const MCP_HANDSHAKE_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  authorization: 'Bearer handshake',
};

const secret = 'self-build-connect-test-secret';
const sessionSecret = 'dev-session-secret-change-me';
const CONCEPT = 'A squad tactics game about clearing rooms with careful timing and cover.';
const APP_BASE = 'https://www.gamedev.pl';
const MASKED_AUTH = 'Authorization: Bearer ····9a10e';

function stubGitHub(): GitHubClient {
  return {
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    ensureOpenPullRequest: async () => ({ number: 1 }),
    deleteBranch: async () => {},
    getGameSources: async (): Promise<GameSources | null> => null,
    getGameMedia: async () => null,
    getCatalog: async (): Promise<CatalogGameEntry[]> => [],
    getProgressNotes: async () => null,
  };
}

async function createApp(options: { now?: () => number } = {}) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:creator', email: 'c@example.com', betaStatus: 'approved' });
  await store.upsertUser({ uid: 'g:stranger', email: 's@example.com', betaStatus: 'approved' });
  const app = await buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh',
      submissionTokenSecret: secret,
      notifyAppBaseUrl: APP_BASE,
      now: options.now,
      // Not under test here — see managed-availability.ts.
      managedAvailabilityGate: null,
    },
  });
  return { app, store };
}

function authHeaders(uid = 'g:creator') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

describe('self-build-connect templates', () => {
  it('builds install snippets that embed the Authorization header with the MCP URL', () => {
    const snippets = buildInstallSnippets({
      appBaseUrl: APP_BASE,
      authorizationBearer: MASKED_AUTH,
    });
    const url = mcpEndpointUrl(APP_BASE);
    expect(url).toBe(`${APP_BASE}${MCP_ENDPOINT_PATH}`);

    expect(snippets).toEqual({
      claudeCode: expect.stringContaining(url),
      codex: expect.stringContaining(url),
      cursor: expect.stringContaining(url),
      kimi: expect.stringContaining(url),
      cli: expect.stringContaining(url),
    });
    expect(snippets.claudeCode).toMatch(/^claude mcp add --transport http gamedevpl /);
    expect(snippets.claudeCode).toContain(MASKED_AUTH);
    expect(snippets.codex).toContain('[mcp_servers.gamedevpl]');
    expect(snippets.codex).toContain('Bearer ····9a10e');
    expect(JSON.parse(snippets.cursor)).toEqual({
      mcpServers: {
        gamedevpl: {
          url,
          headers: { Authorization: 'Bearer ····9a10e' },
        },
      },
    });
    expect(snippets.kimi).toMatch(/^npx -y mcp-remote /);
    expect(snippets.kimi).toContain(MASKED_AUTH);
    expect(snippets.cli).toMatch(/^curl -sS -X POST /);
    expect(snippets.cli).toContain(MASKED_AUTH);

    // Masked Authorization is expected; full raw secrets / kickoff-style key: lines are not.
    for (const value of Object.values(snippets)) {
      expect(value).toMatch(/Authorization|Bearer/i);
      expect(value).not.toMatch(/\bkey:\s*\S+/);
      expect(value).toContain(url);
    }
  });

  it('builds a keyless kickoff prompt with the game slug', () => {
    const bare = buildKickoffPrompt({ title: 'Asteroids', slug: 'asteroids' });
    expect(bare).toBe(
      [
        'Build "Asteroids" for gamedev.pl.',
        'Start with the gamedevpl tool, slug: asteroids',
        'start returns your workflow; after gate green the round is done.',
      ].join('\n'),
    );
    expect(bare).not.toMatch(/\bkey:/);
    expect(bare).not.toMatch(/\btoken\b/i);

    const bareLines = bare.split('\n');
    expect(bareLines.length).toBeLessThanOrEqual(5);
    expect(bareLines).toHaveLength(3);
    expect(bareLines[1]).toBe('Start with the gamedevpl tool, slug: asteroids');
    expect(bare.match(/your workflow/g)).toHaveLength(1);

    const withPending = buildKickoffPrompt({
      title: 'Asteroids',
      slug: 'asteroids',
      pendingMessages: [{ text: 'make the ship faster' }, { text: 'add a pause button' }],
    });
    const pendingLines = withPending.split('\n');
    expect(pendingLines[1]).toBe('Start with the gamedevpl tool, slug: asteroids');
    expect(withPending.indexOf('- make the ship faster')).toBeLessThan(withPending.indexOf('- add a pause button'));
    expect(withPending).toContain('also apply:');
    expect(withPending).toContain('- make the ship faster');
    expect(withPending).toContain('- add a pause button');
  });

  it('builds a keyed kickoff prompt with the game key (legacy / per-game path)', () => {
    const bare = buildKickoffPrompt({ title: 'Asteroids', gameKey: 'game-key-abc' });
    expect(bare).toBe(
      [
        'Build "Asteroids" for gamedev.pl.',
        'Start with the gamedevpl tool, key: game-key-abc',
        'start returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
      ].join('\n'),
    );
    expect(bare).not.toMatch(/\btoken\b/i);
    expect(bare).not.toMatch(/\bslug:/);

    const withReminder = buildKickoffPrompt({
      title: 'Asteroids',
      gameKey: 'game-key-abc',
      sameKeyReminder: true,
    });
    expect(withReminder).toContain('Same key as before — nothing new to copy unless the creator rotated it.');

    expect(() => buildKickoffPrompt({ title: 'Asteroids' })).toThrow(/exactly one of gameKey or slug/);
    expect(() => buildKickoffPrompt({ title: 'Asteroids', gameKey: 'k', slug: 's' })).toThrow(
      /exactly one of gameKey or slug/,
    );
  });

  it('mints a keyless payload whose expiresAt equals the creator key signed exp claim', () => {
    const now = Date.parse('2026-07-31T12:00:00Z');
    const payload = mintConnectPayload({
      slug: 'nebula',
      ownerUid: 'g:creator',
      keyGeneration: 3,
      title: 'Nebula',
      submissionTokenSecret: secret,
      appBaseUrl: APP_BASE,
      now,
    });

    expect(payload.slug).toBe('nebula');
    expect(payload.kickoffPrompt).toContain('slug: nebula');
    expect(payload.kickoffPrompt).not.toMatch(/\bkey:\s*\S+/);
    expect(payload.authorizationHeader).toMatch(/^Authorization: Bearer /);
    expect(payload.authorizationHeaderMasked).toMatch(/^Authorization: Bearer ····/);
    expect(payload.authorizationHeaderMasked).not.toBe(payload.authorizationHeader);

    const creatorKey = payload.authorizationHeader.replace(/^Authorization: Bearer /, '');
    expect(payload.kickoffPrompt).not.toContain(creatorKey);
    for (const snippet of Object.values(payload.installSnippets)) {
      expect(snippet).toContain(payload.authorizationHeaderMasked.replace(/^Authorization: /, ''));
      expect(snippet).not.toContain(creatorKey);
    }

    // BY-18c: deep links are URL-only — never the creator key or any header material.
    expect(Object.keys(payload.installLinks).sort()).toEqual(['cursor', 'vscode']);
    expect(() => assertInstallLinksHaveNoCredentials(payload.installLinks)).not.toThrow();
    expect(decodeCursorInstallConfig(payload.installLinks.cursor)).toEqual({ url: payload.mcpUrl });
    expect(decodeVscodeInstallConfig(payload.installLinks.vscode)).toMatchObject({ url: payload.mcpUrl });
    expect(payload.installLinks.cursor).not.toContain(creatorKey);
    expect(payload.installLinks.vscode).not.toContain(creatorKey);

    const claims = verifyCreatorAgentKey(creatorKey, secret);
    expect(claims).toMatchObject({ creatorUid: 'g:creator', keyGeneration: 3 });
    expect(payload.expiresAt).toBe(claims.exp);
    expect(payload.expiresAt).toBe(Math.floor(now / 1000) + DEFAULT_CREATOR_AGENT_KEY_TTL_DAYS * 24 * 60 * 60);
    expect(payload.keyGeneration).toBe(3);
    expect(payload.fingerprint).toBe(creatorKey.slice(-5));
    expect(() => assertCreatorAgentKeyActive(claims, { keyGeneration: 3 }, now)).not.toThrow();
  });

  it('mints a keyed per-game kickoff via mintGameKeyKickoff', () => {
    const now = Date.parse('2026-07-31T12:00:00Z');
    const payload = mintGameKeyKickoff({
      slug: 'nebula',
      ownerUid: 'g:creator',
      keyGeneration: 2,
      title: 'Nebula',
      submissionTokenSecret: secret,
      appBaseUrl: APP_BASE,
      now,
    });
    const keyMatch = payload.kickoffPrompt.match(/key: (\S+)/);
    expect(keyMatch).toBeTruthy();
    const gameKey = keyMatch![1]!;
    const claims = verifyGameAgentKey(gameKey, secret);
    expect(claims).toMatchObject({ slug: 'nebula', creatorUid: 'g:creator', keyGeneration: 2 });
    expect(payload.expiresAt).toBe(claims.exp);
    expect(payload.keyGeneration).toBe(2);
    expect(payload.kickoffPrompt).not.toMatch(/\bslug:/);
  });
});

describe('GET /api/submissions/:id/connect (BY-03 / BY-27b)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('returns snippets, keyless kickoff, and creator-key fields for the owner of an active self round', async () => {
    const created = await createApp({ now: () => Date.parse('2026-07-31T12:00:00Z') });
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Connect Game', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const id = submit.json().token as string;
    const record = (await store.listSubmissionsByOwner('g:creator'))[0]!;
    expect(record.builder).toBe('self');

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json() as {
      installSnippets: Record<string, string>;
      installLinks: { cursor: string; vscode: string };
      kickoffPrompt: string;
      expiresAt: number;
      keyGeneration: number;
      authorizationHeader: string;
      authorizationHeaderMasked: string;
      fingerprint: string;
      mcpUrl: string;
      slug: string;
      canSwitchToPlatform?: boolean;
    };

    expect(Object.keys(body.installSnippets).sort()).toEqual(['claudeCode', 'cli', 'codex', 'cursor', 'kimi'].sort());
    const mcpUrl = `${APP_BASE}${MCP_ENDPOINT_PATH}`;
    expect(body.mcpUrl).toBe(mcpUrl);
    expect(record.slug).toBeTruthy();
    expect(body.slug).toBe(record.slug);
    expect(body.canSwitchToPlatform).toBe(true);

    await store.touchLastAgentSignalAt(record.jobId, '2026-07-31T12:00:00Z');
    const activeResponse = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(activeResponse.statusCode).toBe(200);
    expect((activeResponse.json() as { canSwitchToPlatform?: boolean }).canSwitchToPlatform).toBe(false);

    const creatorKey = body.authorizationHeader.replace(/^Authorization: Bearer /, '');
    expect(body.authorizationHeaderMasked).toBe(`Authorization: Bearer ····${body.fingerprint}`);
    expect(body.authorizationHeaderMasked).not.toContain(creatorKey);

    for (const snippet of Object.values(body.installSnippets)) {
      expect(snippet).toContain(mcpUrl);
      expect(snippet).toMatch(/Authorization|Bearer/i);
      expect(snippet).toContain(body.fingerprint);
      expect(snippet).not.toContain(creatorKey);
      expect(snippet).not.toMatch(/\bkey:\s*\S+/);
    }

    // Hand-copy paths unchanged; deep links are a parallel, credential-free affordance.
    expect(() => assertInstallLinksHaveNoCredentials(body.installLinks)).not.toThrow();
    expect(body.installLinks.cursor).not.toContain(creatorKey);
    expect(body.installLinks.vscode).not.toContain(creatorKey);
    expect(decodeCursorInstallConfig(body.installLinks.cursor)).toEqual({ url: mcpUrl });

    expect(body.kickoffPrompt).toContain('Build "Connect Game" for gamedev.pl.');
    expect(body.kickoffPrompt).toContain(`slug: ${record.slug}`);
    expect(body.kickoffPrompt).not.toMatch(/\bkey:\s*\S+/);
    expect(body.kickoffPrompt).not.toContain(creatorKey);
    expect(body.kickoffPrompt).not.toMatch(/\btoken\b/i);

    const claims = verifyCreatorAgentKey(creatorKey, secret);
    expect(claims.creatorUid).toBe(record.ownerUid);
    const keyRecord = await store.getCreatorAgentKey(record.ownerUid);
    expect(keyRecord).toBeTruthy();
    expect(body.keyGeneration).toBe(keyRecord!.keyGeneration);
    expect(body.expiresAt).toBe(claims.exp);
    expect(() => assertCreatorAgentKeyActive(claims, keyRecord!, Date.parse('2026-07-31T12:00:00Z'))).not.toThrow();

    // Creator key from connect can bind start via Bearer + slug.
    const init = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: MCP_HANDSHAKE_HEADERS,
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      },
    });
    const sessionId = init.headers['mcp-session-id'] as string;
    const start = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
        authorization: `Bearer ${creatorKey}`,
      },
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'start', arguments: { slug: record.slug } },
      },
    });
    const startBody = start.json() as {
      result?: { isError?: boolean; structuredContent?: { sessionKey?: string }; content?: Array<{ text: string }> };
    };
    expect(startBody.result?.isError).toBeFalsy();
    const startStructured =
      startBody.result?.structuredContent ??
      (startBody.result?.content?.[0]?.text ? JSON.parse(startBody.result.content[0].text) : undefined);
    expect((startStructured as { sessionKey?: string })?.sessionKey).toBeTruthy();
  });

  it('rejects a stranger with 403', async () => {
    const created = await createApp();
    app = created.app;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders('g:creator'),
      payload: { title: 'Private Self', concept: CONCEPT, builder: 'self' },
    });
    const id = submit.json().token as string;

    const stranger = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders('g:stranger'),
    });
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toMatchObject({ error: 'only the creator can connect a build' });

    const anon = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
    });
    expect(anon.statusCode).toBe(401);
  });

  it('returns 409 for a platform (non-self) round', async () => {
    const created = await createApp();
    app = created.app;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Platform Round', concept: CONCEPT, builder: 'platform' },
    });
    const id = submit.json().token as string;

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'connect_unavailable',
      reason: 'not_self_round',
      builder: 'platform',
    });
  });

  it('refuses to mint after a race closes the round between the first read and generation mint', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    await store.createSubmission(99, 'g:creator', 'Race Close');
    await store.setRoundBuilder(99, 'self');
    await store.recordJobTransition(99, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });
    await store.ensureRoundGeneration(99);

    const originalGet = store.getSubmission.bind(store);
    let reads = 0;
    store.getSubmission = async (jobId: number) => {
      const hit = await originalGet(jobId);
      reads += 1;
      // After the connect handler's first ownership/builder check, close the round
      // before ensureRoundGeneration / the revalidation read.
      if (reads === 1 && hit) {
        await store.recordJobTransition(99, {
          to: 'ready_for_review',
          at: new Date().toISOString(),
          by: 'gate',
          reason: 'gate_green',
        });
      }
      return originalGet(jobId);
    };

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(99, secret)}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'connect_unavailable',
      reason: 'inactive_round',
    });
  });

  it('does not unlock connect from defaultBuilder alone when the active round builder is unset', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    await store.createSubmission(88, 'g:creator', 'Legacy Default');
    // Simulate a stale default without an active-round builder field.
    await store.setRoundBuilder(88, 'self');
    const sub = await store.getSubmission(88);
    const map = (store as unknown as { submissions: Map<number, typeof sub> }).submissions;
    map.set(88, { ...sub!, builder: undefined, defaultBuilder: 'self' });
    await store.recordJobTransition(88, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${mintToken(88, secret)}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'connect_unavailable',
      reason: 'not_self_round',
      builder: 'platform',
    });
  });

  it('returns 409 when the self round is no longer active', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Closed Self', concept: CONCEPT, builder: 'self' },
    });
    const id = submit.json().token as string;
    const record = (await store.listSubmissionsByOwner('g:creator'))[0]!;
    await store.recordJobTransition(record.jobId, {
      to: 'abandoned',
      at: new Date().toISOString(),
      by: 'system',
      reason: 'no_connect',
    });
    await store.setSubmissionAbandoned(record.jobId, new Date().toISOString());

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'connect_unavailable',
      reason: 'inactive_round',
      builder: 'self',
    });
  });

  it('mints a slug on demand for a legacy self round missing one', async () => {
    const created = await createApp({ now: () => Date.parse('2026-07-31T12:00:00Z') });
    app = created.app;
    const { store } = created;

    await store.createSubmission(66, 'g:creator', 'Legacy Slugless');
    await store.setRoundBuilder(66, 'self');
    await store.recordJobTransition(66, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });
    await store.ensureRoundGeneration(66);
    const before = await store.getSubmission(66);
    expect(before?.slug).toBeUndefined();

    const id = mintToken(66, secret);
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const after = await store.getSubmission(66);
    expect(after?.slug).toBeTruthy();
    const body = response.json() as { kickoffPrompt: string; slug: string; authorizationHeader: string };
    expect(body.slug).toBe(after!.slug);
    expect(body.kickoffPrompt).toContain(`slug: ${after!.slug}`);
    expect(body.kickoffPrompt).not.toMatch(/\bkey:\s*\S+/);
    const creatorKey = body.authorizationHeader.replace(/^Authorization: Bearer /, '');
    const claims = verifyCreatorAgentKey(creatorKey, secret);
    expect(claims).toMatchObject({ creatorUid: 'g:creator', keyGeneration: 1 });
  });

  it('retires the per-game key endpoint instead of minting another legacy credential', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    await store.createSubmission(77, 'g:creator', 'Bound Round');
    await store.setSubmissionSlug(77, 'bound-round');
    await store.setRoundBuilder(77, 'self');
    await store.recordJobTransition(77, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });
    await store.ensureRoundGeneration(77);
    const id = mintToken(77, secret);
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/agent-key`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({ error: 'per_game_keys_retired' });
    expect(await store.getGameAgentKey('bound-round')).toBeNull();
  });

  it('embeds pending unacknowledged creator inbox messages in the kickoff', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    const submit = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Feedback Game', concept: CONCEPT, builder: 'self' },
    });
    const id = submit.json().token as string;
    const record = (await store.listSubmissionsByOwner('g:creator'))[0]!;

    const first = await store.appendCreatorMessage(record.jobId, 'make the ship faster');
    await store.appendCreatorMessage(record.jobId, 'add a pause button');
    await store.markCreatorMessagesDelivered(record.jobId, [first.id]);

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const prompt = response.json().kickoffPrompt as string;
    expect(prompt).toContain('also apply:');
    expect(prompt).toContain('- add a pause button');
    expect(prompt).not.toContain('make the ship faster');
    expect(prompt).toMatch(/slug: \S+/);
    expect(prompt).not.toMatch(/\bkey:\s*\S+/);
  });
});

async function mcpStart(
  app: FastifyInstance,
  key: string,
): Promise<{ ok: boolean; error?: string; sessionKey?: string }> {
  const init = await app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: MCP_HANDSHAKE_HEADERS,
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    },
  });
  const sessionId = init.headers['mcp-session-id'] as string;
  const res = await app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sessionId,
    },
    payload: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'start', arguments: { key } },
    },
  });
  const body = res.json() as {
    result?: { isError?: boolean; structuredContent?: { sessionKey?: string }; content?: Array<{ text: string }> };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  if (body.result?.isError) {
    return { ok: false, error: JSON.stringify(structured) };
  }
  return { ok: true, sessionKey: (structured as { sessionKey?: string })?.sessionKey };
}

describe('retired game agent key API', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  async function submitSelfRound(store: InMemoryStore) {
    const submit = await app!.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: authHeaders(),
      payload: { title: 'Key Game', concept: CONCEPT, builder: 'self' },
    });
    expect(submit.statusCode).toBe(200);
    const id = submit.json().token as string;
    const record = (await store.listSubmissionsByOwner('g:creator'))[0]!;
    expect(record.slug).toBeTruthy();
    return { id, record };
  }

  it('returns 410 from both management routes and refuses an already-issued key at start', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id, record } = await submitSelfRound(store);
    await store.ensureGameAgentKey(record.slug!, record.ownerUid, new Date().toISOString());
    const oldKey = mintGameAgentKey(secret, {
      slug: record.slug!,
      creatorUid: record.ownerUid,
      keyGeneration: 1,
    });

    const agentKey = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/agent-key`,
      headers: authHeaders(),
    });
    expect(agentKey.statusCode).toBe(410);
    expect(agentKey.json()).toMatchObject({ error: 'per_game_keys_retired' });

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/submissions/${id}/agent-key/rotate`,
      headers: authHeaders(),
    });
    expect(rotated.statusCode).toBe(410);
    expect(rotated.json()).toMatchObject({ error: 'per_game_keys_retired' });

    const oldStart = await mcpStart(app, oldKey);
    expect(oldStart.ok).toBe(false);
    expect(oldStart.error).toMatch(/per-game keys are retired/i);
  });

  it('still requires a signed-in creator before returning the retirement response', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id } = await submitSelfRound(store);

    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/agent-key`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('does not rotate a stored legacy generation', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id, record } = await submitSelfRound(store);

    await store.ensureGameAgentKey(record.slug!, record.ownerUid, new Date().toISOString());
    const beforeClose = await store.getGameAgentKey(record.slug!);
    expect(beforeClose?.keyGeneration).toBe(1);

    const response = await app.inject({
      method: 'POST',
      url: `/api/submissions/${id}/agent-key/rotate`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(410);

    const afterAttempt = await store.getGameAgentKey(record.slug!);
    expect(afterAttempt?.keyGeneration).toBe(1);
  });
});
