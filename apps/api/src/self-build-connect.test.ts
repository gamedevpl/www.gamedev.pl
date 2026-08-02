import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { assertGameAgentKeyActive, DEFAULT_GAME_AGENT_KEY_TTL_DAYS, verifyGameAgentKey } from './agent-game-key.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from './github-client.js';
import {
  buildInstallSnippets,
  buildKickoffPrompt,
  mcpEndpointUrl,
  mintConnectPayload,
  MCP_ENDPOINT_PATH,
} from './self-build-connect.js';
import { InMemoryStore } from './store.js';
import { mintToken } from './submission-token.js';
import { NoopTranslator } from './translate.js';

const secret = 'self-build-connect-test-secret';
const sessionSecret = 'dev-session-secret-change-me';
const CONCEPT = 'A squad tactics game about clearing rooms with careful timing and cover.';
const APP_BASE = 'https://www.gamedev.pl';

function stubGitHub(): GitHubClient {
  return {
    createIssue: async () => ({ number: 1 }),
    getIssueState: async () => ({ state: 'open' as const }),
    findLinkedPR: async (): Promise<LinkedPullRequest | null> => null,
    createIssueComment: async () => ({ id: 1 }),
    updateIssueBody: async () => {},
    closeIssue: async () => {},
    closePullRequest: async () => {},
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
      translator: new NoopTranslator(),
      notifyAppBaseUrl: APP_BASE,
      now: options.now,
    },
  });
  return { app, store };
}

function authHeaders(uid = 'g:creator') {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

describe('self-build-connect templates', () => {
  it('builds install snippets that configure only the MCP URL', () => {
    const snippets = buildInstallSnippets({ appBaseUrl: APP_BASE });
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
    expect(snippets.codex).toContain('[mcp_servers.gamedevpl]');
    expect(JSON.parse(snippets.cursor)).toEqual({
      mcpServers: { gamedevpl: { url } },
    });
    expect(snippets.kimi).toMatch(/^npx -y mcp-remote /);
    expect(snippets.cli).toMatch(/^curl -sS -X POST /);

    // No credential in any install snippet — only the URL.
    for (const value of Object.values(snippets)) {
      expect(value).not.toMatch(/key:|Bearer|token|Authorization/i);
      expect(value).toContain(url);
    }
  });

  it('builds a kickoff prompt with the game key, a loop pointer, and pending feedback', () => {
    const bare = buildKickoffPrompt({ title: 'Asteroids', gameKey: 'game-key-abc' });
    expect(bare).toBe(
      [
        'Build "Asteroids" for gamedev.pl.',
        'Start with the gamedevpl tool, key: game-key-abc',
        'start returns your workflow; after gate green the round is done — keep this key for the next round on this game unless the creator rotates it.',
      ].join('\n'),
    );
    expect(bare).not.toMatch(/\btoken\b/i);

    const bareLines = bare.split('\n');
    expect(bareLines.length).toBeLessThanOrEqual(5);
    expect(bareLines).toHaveLength(3);
    expect(bareLines[1]).toBe('Start with the gamedevpl tool, key: game-key-abc');
    expect(bareLines[2]).toMatch(/keep this key for the next round/i);
    expect(bare.match(/your workflow/g)).toHaveLength(1);

    const withReminder = buildKickoffPrompt({
      title: 'Asteroids',
      gameKey: 'game-key-abc',
      sameKeyReminder: true,
    });
    expect(withReminder).toContain('Same key as before — nothing new to copy unless the creator rotated it.');

    const withPending = buildKickoffPrompt({
      title: 'Asteroids',
      gameKey: 'game-key-abc',
      pendingMessages: [{ text: 'make the ship faster' }, { text: 'add a pause button' }],
    });
    const pendingLines = withPending.split('\n');
    expect(pendingLines[1]).toBe('Start with the gamedevpl tool, key: game-key-abc');
    expect(pendingLines[2]).toMatch(/keep this key for the next round/i);
    expect(withPending.indexOf('- make the ship faster')).toBeLessThan(withPending.indexOf('- add a pause button'));
    expect(withPending).toContain('also apply:');
    expect(withPending).toContain('- make the ship faster');
    expect(withPending).toContain('- add a pause button');
  });

  it('mints a payload whose expiresAt equals the key signed exp claim', () => {
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
    const keyMatch = payload.kickoffPrompt.match(/key: (\S+)/);
    expect(keyMatch).toBeTruthy();
    const gameKey = keyMatch![1]!;
    const claims = verifyGameAgentKey(gameKey, secret);
    expect(claims).toMatchObject({ slug: 'nebula', creatorUid: 'g:creator', keyGeneration: 3 });
    expect(payload.expiresAt).toBe(claims.exp);
    expect(payload.expiresAt).toBe(Math.floor(now / 1000) + DEFAULT_GAME_AGENT_KEY_TTL_DAYS * 24 * 60 * 60);
    expect(payload.keyGeneration).toBe(3);
    expect(() => assertGameAgentKeyActive(claims, { keyGeneration: 3 }, now)).not.toThrow();
  });
});

describe('GET /api/submissions/:id/connect (BY-03)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('returns snippets, kickoff, and expiresAt for the owner of an active self round', async () => {
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
      kickoffPrompt: string;
      expiresAt: number;
      keyGeneration: number;
    };

    expect(Object.keys(body.installSnippets).sort()).toEqual(['claudeCode', 'cli', 'codex', 'cursor', 'kimi'].sort());
    const mcpUrl = `${APP_BASE}${MCP_ENDPOINT_PATH}`;
    for (const snippet of Object.values(body.installSnippets)) {
      expect(snippet).toContain(mcpUrl);
      expect(snippet).not.toMatch(/key:|Bearer |\btoken\b/i);
    }

    expect(body.kickoffPrompt).toContain('Build "Connect Game" for gamedev.pl.');
    expect(body.kickoffPrompt).toMatch(/Start with the gamedevpl tool, key: \S+/);
    expect(body.kickoffPrompt).not.toMatch(/\btoken\b/i);

    expect(record.slug).toBeTruthy();
    const gameKey = body.kickoffPrompt.match(/key: (\S+)/)![1]!;
    const claims = verifyGameAgentKey(gameKey, secret);
    expect(claims.slug).toBe(record.slug);
    expect(claims.creatorUid).toBe(record.ownerUid);
    const keyRecord = await store.getGameAgentKey(record.slug!);
    expect(keyRecord).toBeTruthy();
    expect(body.keyGeneration).toBe(keyRecord!.keyGeneration);
    expect(body.expiresAt).toBe(claims.exp);
    expect(() => assertGameAgentKeyActive(claims, keyRecord!, Date.parse('2026-07-31T12:00:00Z'))).not.toThrow();
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
    store.getSubmission = async (issueNumber: number) => {
      const hit = await originalGet(issueNumber);
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
      return originalGet(issueNumber);
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
    await store.recordJobTransition(record.issueNumber, {
      to: 'abandoned',
      at: new Date().toISOString(),
      by: 'system',
      reason: 'no_connect',
    });
    await store.setSubmissionAbandoned(record.issueNumber, new Date().toISOString());

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

  it('binds the minted key to the game keyGeneration, not the round generation', async () => {
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
    await store.ensureGameAgentKey('bound-round', 'g:creator', new Date().toISOString());
    // Simulate a later round: roundGeneration 2 is active; game keyGeneration stays 1.
    await store.bumpRoundGeneration(77);
    const afterBump = await store.getSubmission(77);
    expect(afterBump?.roundGeneration).toBe(2);

    const id = mintToken(77, secret);
    const response = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const gameKey = (response.json().kickoffPrompt as string).match(/key: (\S+)/)![1]!;
    const claims = verifyGameAgentKey(gameKey, secret);
    expect(claims).toMatchObject({ slug: 'bound-round', creatorUid: 'g:creator', keyGeneration: 1 });
    const keyRecord = await store.getGameAgentKey('bound-round');
    expect(() => assertGameAgentKeyActive(claims, keyRecord!)).not.toThrow();
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

    const first = await store.appendCreatorMessage(record.issueNumber, 'make the ship faster');
    await store.appendCreatorMessage(record.issueNumber, 'add a pause button');
    await store.markCreatorMessagesDelivered(record.issueNumber, [first.id]);

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
  });
});

async function mcpStart(
  app: FastifyInstance,
  key: string,
): Promise<{ ok: boolean; error?: string; sessionKey?: string }> {
  const init = await app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
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

function extractGameKey(kickoffPrompt: string): string {
  return kickoffPrompt.match(/key: (\S+)/)![1]!;
}

describe('game agent key API (BY-23)', () => {
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

  it('rotate bumps generation; old kickoff key fails start; new works', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id, record } = await submitSelfRound(store);

    const connect = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    const oldKey = extractGameKey(connect.json().kickoffPrompt as string);

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/submissions/${id}/agent-key/rotate`,
      headers: authHeaders(),
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().keyGeneration).toBe(2);
    const newKey = extractGameKey(rotated.json().kickoffPrompt as string);

    const oldStart = await mcpStart(app, oldKey);
    expect(oldStart.ok).toBe(false);
    expect(oldStart.error).toMatch(/rotated/i);

    const newStart = await mcpStart(app, newKey);
    expect(newStart.ok).toBe(true);
    expect(newStart.sessionKey).toBeTruthy();
    void record;
  });

  it('GET agent-key remint does NOT bump generation', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id } = await submitSelfRound(store);

    const first = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/agent-key`,
      headers: authHeaders(),
    });
    expect(first.statusCode).toBe(200);
    const gen1 = first.json().keyGeneration as number;

    const second = await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/agent-key`,
      headers: authHeaders(),
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().keyGeneration).toBe(gen1);

    const keyRecord = await store.getGameAgentKey((await store.listSubmissionsByOwner('g:creator'))[0]!.slug!);
    expect(keyRecord?.keyGeneration).toBe(gen1);
  });

  it('round close does not bump game keyGeneration', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;
    const { id, record } = await submitSelfRound(store);

    await app.inject({
      method: 'GET',
      url: `/api/submissions/${id}/connect`,
      headers: authHeaders(),
    });
    const beforeClose = await store.getGameAgentKey(record.slug!);
    expect(beforeClose?.keyGeneration).toBe(1);

    await store.recordJobTransition(record.issueNumber, {
      to: 'ready_for_review',
      at: new Date().toISOString(),
      by: 'gate',
      reason: 'gate_green',
    });

    const afterClose = await store.getGameAgentKey(record.slug!);
    expect(afterClose?.keyGeneration).toBe(1);
  });
});
