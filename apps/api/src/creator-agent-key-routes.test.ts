import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCreatorAgentKeyActive,
  mintCreatorAgentKey,
  NO_OPEN_ROUND_REASON,
  PLATFORM_ROUND_REASON,
  ROTATED_CREATOR_KEY_REASON,
  verifyCreatorAgentKey,
} from './agent-creator-key.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintAgentToken } from './agent-token.js';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { InMemoryStore } from './store.js';
import { NoopTranslator } from './translate.js';

const SESSION_SECRET = 'dev-session-secret-change-me';
const MCP_SECRET = 'creator-key-mcp-secret';

function sessionCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, SESSION_SECRET)}`;
}

async function buildTestApp(store: InMemoryStore) {
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

async function seedSelfRound(store: InMemoryStore, issue = 42, owner = 'g:creator', slug = 'comet-courier') {
  await store.createSubmission(issue, owner, 'Comet Courier');
  await store.setSubmissionSlug(issue, slug);
  await store.setSubmissionLocale(issue, 'en');
  await store.setRoundBuilder(issue, 'self');
  await store.setSubmissionBrief(issue, { spec: 'Build it.', qa: [] });
  await store.recordJobTransition(issue, {
    to: 'dispatched',
    at: new Date().toISOString(),
    by: 'system',
  });
}

async function mcpInitialize(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: MCP_ENDPOINT_PATH,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
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
  expect(res.statusCode).toBe(200);
  return String(res.headers['mcp-session-id']);
}

async function callTool(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: MCP_ENDPOINT_PATH,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    payload: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: { structuredContent?: Record<string, unknown>; isError?: boolean };
  };
  return { structured: body.result?.structuredContent, isError: Boolean(body.result?.isError) };
}

describe('creator agent key API (BY-27a)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('mints, remints at same generation, rotate kills prior key, revoke blocks until remint', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    app = await buildTestApp(store);
    const cookie = sessionCookie('g:creator');

    const minted = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key',
      headers: { cookie },
    });
    expect(minted.statusCode).toBe(200);
    expect(minted.headers['cache-control']).toMatch(/no-store/i);
    const first = minted.json() as { key: string; keyGeneration: number; expiresAt: number };
    expect(first.keyGeneration).toBe(1);
    expect(verifyCreatorAgentKey(first.key, MCP_SECRET).creatorUid).toBe('g:creator');

    const status = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    const reminted = status.json() as { key: string; keyGeneration: number; revoked: boolean };
    expect(reminted.keyGeneration).toBe(1);
    expect(reminted.revoked).toBe(false);
    expect(verifyCreatorAgentKey(reminted.key, MCP_SECRET).keyGeneration).toBe(1);

    const rotated = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key/rotate',
      headers: { cookie },
    });
    expect(rotated.statusCode).toBe(200);
    const second = rotated.json() as { key: string; keyGeneration: number };
    expect(second.keyGeneration).toBe(2);
    const record = await store.getCreatorAgentKey('g:creator');
    expect(record?.keyGeneration).toBe(2);
    expect(() => assertCreatorAgentKeyActive(verifyCreatorAgentKey(first.key, MCP_SECRET), record!)).toThrow(
      ROTATED_CREATOR_KEY_REASON,
    );
    expect(() => assertCreatorAgentKeyActive(verifyCreatorAgentKey(second.key, MCP_SECRET), record!)).not.toThrow();

    const revoked = await app.inject({
      method: 'DELETE',
      url: '/api/me/creator-agent-key',
      headers: { cookie },
    });
    expect(revoked.statusCode).toBe(204);
    const afterRevoke = await store.getCreatorAgentKey('g:creator');
    expect(afterRevoke?.revokedAt).toBeTruthy();
    expect(afterRevoke?.keyGeneration).toBe(3);
    expect(() => assertCreatorAgentKeyActive(verifyCreatorAgentKey(second.key, MCP_SECRET), afterRevoke!)).toThrow(
      ROTATED_CREATOR_KEY_REASON,
    );

    const remintAfterRevoke = await app.inject({
      method: 'POST',
      url: '/api/me/creator-agent-key',
      headers: { cookie },
    });
    expect(remintAfterRevoke.statusCode).toBe(200);
    const third = remintAfterRevoke.json() as { key: string; keyGeneration: number };
    expect(third.keyGeneration).toBe(3);
    expect(verifyCreatorAgentKey(third.key, MCP_SECRET).keyGeneration).toBe(3);
  });

  it('requires a session', async () => {
    const store = new InMemoryStore();
    app = await buildTestApp(store);
    const res = await app.inject({ method: 'POST', url: '/api/me/creator-agent-key' });
    expect(res.statusCode).toBe(401);
  });
});

describe('creator agent key MCP start (BY-27a)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('start via Authorization Bearer + slug binds to the creator open self round', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store);
    await store.upsertUser({ uid: 'g:creator' });
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);
    const key = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });

    const started = await callTool(
      app,
      'start',
      { slug: 'comet-courier' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${key}` },
    );
    expect(started.isError).toBe(false);
    expect(started.structured).toMatchObject({ jobId: 42, slug: 'comet-courier', title: 'Comet Courier' });
    expect(typeof started.structured?.sessionKey).toBe('string');
  });

  it('refuses a slug the creator does not own', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 42, 'g:other', 'stranger-game');
    await store.upsertUser({ uid: 'g:creator' });
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);
    const key = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });

    const started = await callTool(
      app,
      'start',
      { slug: 'stranger-game' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${key}` },
    );
    expect(started.isError).toBe(true);
    expect(started.structured?.error).toBe(NO_OPEN_ROUND_REASON);
  });

  it('reuses no-open-round and platform-round refusals', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);
    const key = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });

    const noRound = await callTool(
      app,
      'start',
      { slug: 'missing-game' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${key}` },
    );
    expect(noRound.isError).toBe(true);
    expect(noRound.structured?.error).toBe(NO_OPEN_ROUND_REASON);

    await seedSelfRound(store, 99, 'g:creator', 'platform-game');
    await store.setRoundBuilder(99, 'platform');
    const platform = await callTool(
      app,
      'start',
      { slug: 'platform-game' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${key}` },
    );
    expect(platform.isError).toBe(true);
    expect(platform.structured?.error).toBe(PLATFORM_ROUND_REASON);
  });

  it('rejects the creator key on every write tool', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store);
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);
    const key = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });

    const viaSessionKey = await callTool(
      app,
      'report_progress',
      { sessionKey: key, text: 'nope' },
      { 'mcp-session-id': sessionId },
    );
    expect(viaSessionKey.isError).toBe(true);
    expect(String(viaSessionKey.structured?.error)).toMatch(/only opens a session via start/i);

    const viaBearer = await callTool(
      app,
      'report_progress',
      { text: 'nope' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${key}` },
    );
    expect(viaBearer.isError).toBe(true);
    expect(String(viaBearer.structured?.error)).toMatch(/only opens a session via start/i);
  });

  it('legacy round key and durable per-game key still work end to end', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store, 77, 'g:owner');
    const at = new Date().toISOString();
    await store.ensureGameAgentKey('comet-courier', 'g:owner', at);
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);

    const roundKey = mintAgentToken(77, MCP_SECRET, { roundGeneration: 1 });
    const briefRound = await callTool(
      app,
      'get_brief',
      {},
      { 'mcp-session-id': sessionId, authorization: `Bearer ${roundKey}` },
    );
    expect(briefRound.isError).toBe(false);

    const gameKey = mintGameAgentKey(MCP_SECRET, {
      slug: 'comet-courier',
      creatorUid: 'g:owner',
      keyGeneration: 1,
    });
    const started = await callTool(app, 'start', { key: gameKey }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(false);
    const sessionKey = started.structured?.sessionKey as string;
    expect(typeof sessionKey).toBe('string');

    const progress = await callTool(
      app,
      'report_progress',
      { sessionKey, text: 'still works' },
      { 'mcp-session-id': sessionId },
    );
    expect(progress.isError).toBe(false);
  });

  it('refuses a creator key passed as the key argument', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store);
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);
    const key = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });

    const started = await callTool(app, 'start', { key, slug: 'comet-courier' }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(true);
    expect(String(started.structured?.error)).toMatch(/Authorization Bearer/i);
  });

  it('refuses a wrong-creator signature and a stale generation', async () => {
    const store = new InMemoryStore();
    await seedSelfRound(store);
    await store.ensureCreatorAgentKey('g:creator', new Date().toISOString());
    await store.rotateCreatorAgentKey('g:creator', new Date().toISOString());
    app = await buildTestApp(store);
    const sessionId = await mcpInitialize(app);

    const stale = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:creator', keyGeneration: 1 });
    const staleStart = await callTool(
      app,
      'start',
      { slug: 'comet-courier' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${stale}` },
    );
    expect(staleStart.isError).toBe(true);
    expect(staleStart.structured?.error).toBe(ROTATED_CREATOR_KEY_REASON);

    const wrongCreator = mintCreatorAgentKey(MCP_SECRET, { creatorUid: 'g:intruder', keyGeneration: 2 });
    await store.ensureCreatorAgentKey('g:intruder', new Date().toISOString());
    await store.rotateCreatorAgentKey('g:intruder', new Date().toISOString());
    const wrongStart = await callTool(
      app,
      'start',
      { slug: 'comet-courier' },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${wrongCreator}` },
    );
    expect(wrongStart.isError).toBe(true);
    expect(wrongStart.structured?.error).toBe(NO_OPEN_ROUND_REASON);
  });
});
