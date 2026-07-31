import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { assertAgentTokenActive, verifyAgentToken } from './agent-token.js';
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

  it('builds a kickoff prompt with the round key and pending feedback', () => {
    const bare = buildKickoffPrompt({ title: 'Asteroids', roundKey: 'round-key-abc' });
    expect(bare).toBe(
      ['Build "Asteroids" for gamedev.pl.', 'Start with the gamedevpl tool, key: round-key-abc'].join('\n'),
    );
    expect(bare).not.toMatch(/\btoken\b/i);

    const withPending = buildKickoffPrompt({
      title: 'Asteroids',
      roundKey: 'round-key-abc',
      pendingMessages: [{ text: 'make the ship faster' }, { text: 'add a pause button' }],
    });
    expect(withPending).toContain('also apply:');
    expect(withPending).toContain('- make the ship faster');
    expect(withPending).toContain('- add a pause button');
  });

  it('mints a payload whose expiresAt equals the key signed exp claim', () => {
    const now = Date.parse('2026-07-31T12:00:00Z');
    const payload = mintConnectPayload({
      jobId: 42,
      title: 'Nebula',
      roundGeneration: 3,
      submissionTokenSecret: secret,
      appBaseUrl: APP_BASE,
      now,
    });
    const keyMatch = payload.kickoffPrompt.match(/key: (\S+)/);
    expect(keyMatch).toBeTruthy();
    const roundKey = keyMatch![1]!;
    const claims = verifyAgentToken(roundKey, secret);
    expect(claims).toMatchObject({ jobId: 42, roundGeneration: 3 });
    expect(payload.expiresAt).toBe(claims.exp);
    expect(payload.expiresAt).toBe(Math.floor(now / 1000) + 14 * 24 * 60 * 60);
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 3 }, now)).not.toThrow();
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
    const body = response.json() as {
      installSnippets: Record<string, string>;
      kickoffPrompt: string;
      expiresAt: number;
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

    const roundKey = body.kickoffPrompt.match(/key: (\S+)/)![1]!;
    const claims = verifyAgentToken(roundKey, secret);
    expect(claims.jobId).toBe(record.issueNumber);
    expect(claims.roundGeneration).toBe(record.roundGeneration ?? 1);
    expect(body.expiresAt).toBe(claims.exp);
    expect(() =>
      assertAgentTokenActive(
        claims,
        { roundGeneration: record.roundGeneration ?? 1 },
        Date.parse('2026-07-31T12:00:00Z'),
      ),
    ).not.toThrow();
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

  it('binds the minted key to the job round generation', async () => {
    const created = await createApp();
    app = created.app;
    const { store } = created;

    await store.createSubmission(77, 'g:creator', 'Bound Round');
    await store.setRoundBuilder(77, 'self');
    await store.recordJobTransition(77, {
      to: 'dispatched',
      at: new Date().toISOString(),
      by: 'system',
    });
    await store.ensureRoundGeneration(77);
    // Simulate a later round: generation 2 is active.
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
    const roundKey = (response.json().kickoffPrompt as string).match(/key: (\S+)/)![1]!;
    const claims = verifyAgentToken(roundKey, secret);
    expect(claims).toMatchObject({ jobId: 77, roundGeneration: 2 });
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 1 })).toThrow();
    expect(() => assertAgentTokenActive(claims, { roundGeneration: 2 })).not.toThrow();
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
