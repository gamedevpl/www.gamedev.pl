import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { buildApp } from '../platform/app.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import { InMemoryStore } from '../platform/store.js';
import { mintAgentToken } from '../platform/agent-token.js';
import { verifyMcpSessionKey } from './mcp-session-key.js';

const secret = 'mcp-editor-session-secret';
const sessionSecret = 'dev-session-secret-change-me';
const OWNER = 'g:ada';
const EDITOR = 'g:bea';
const SLUG = 'comet-courier';
const AT = '2026-09-16T10:00:00.000Z';

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

async function createApp(store: InMemoryStore) {
  await store.upsertUser({ uid: OWNER, email: 'ada@example.com', betaStatus: 'approved' });
  await store.upsertUser({ uid: EDITOR, email: 'bea@example.com', betaStatus: 'approved' });
  return buildApp({
    store,
    sessionSecret,
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh',
      submissionTokenSecret: secret,
      managedAvailabilityGate: null,
    },
  });
}

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

async function mcpCall(app: FastifyInstance, method: string, params?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(method === 'initialize' ? { authorization: 'Bearer handshake', ...headers } : headers),
    },
    payload: { jsonrpc: '2.0', id: 1, method, ...(params !== undefined ? { params } : {}) },
  });
}

async function initialize(app: FastifyInstance) {
  const res = await mcpCall(app, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  return String(res.headers['mcp-session-id']);
}

async function callTool(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, 'tools/call', { name, arguments: args }, headers);
  const body = res.json() as {
    result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text: string }> };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
  return { structured, isError: Boolean(body.result?.isError) };
}

async function seedSharedRound(store: InMemoryStore, author = OWNER) {
  await store.ensureGameAccess(SLUG, OWNER, AT, AT);
  await store.createSubmission(55, author, 'Comet Courier');
  await store.setSubmissionSlug(55, SLUG);
  await store.setRoundBuilder(55, 'self');
  await store.recordJobTransition(55, { to: 'dispatched', at: AT, by: 'system' });
  const code = (await store.ensureRecipientCode(EDITOR, AT))!;
  await store.createEditorInvitation(SLUG, OWNER, EDITOR, AT, code);
  await store.acceptEditorInvitation(SLUG, EDITOR, AT, (await store.getEditorInvite(SLUG, EDITOR, AT))!.inviteId);
}

describe('MCP editor session actor', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('lets the owner continue an active round authored by a removed editor', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store, EDITOR);
    await store.ensureRoundGeneration(55);
    const sessionId = await initialize(app);
    const startAs = async (uid: string) => {
      const minted = await app!.inject({ method: 'GET', url: '/api/me/creator-agent-key', headers: authHeaders(uid) });
      return callTool(
        app!,
        'start',
        { slug: SLUG },
        {
          'mcp-session-id': sessionId,
          authorization: `Bearer ${minted.json().key}`,
        },
      );
    };
    const editor = await startAs(EDITOR);
    expect(editor.isError).toBe(false);
    expect(await store.removeEditor(SLUG, OWNER, EDITOR, AT)).toMatchObject({ editorUids: [] });
    const owner = await startAs(OWNER);
    expect(owner.isError).toBe(false);
    const sessionKey = (owner.structured as { sessionKey: string }).sessionKey;
    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.isError).toBe(false);
    const games = await callTool(app, 'list_account_games', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(games.isError).toBe(false);
    const oldKey = (editor.structured as { sessionKey: string }).sessionKey;
    expect((await callTool(app, 'get_brief', { sessionKey: oldKey }, { 'mcp-session-id': sessionId })).isError).toBe(
      true,
    );
    expect((await store.getSubmission(55))?.ownerUid).toBe(EDITOR);
  });

  it('preserves the actor when opening a session with an actor-bound channel key', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);
    const generation = await store.ensureRoundGeneration(55);
    const key = mintAgentToken(55, secret, {
      roundGeneration: generation!,
      actorUid: EDITOR,
      actorRevision: (await store.getGameAccess(SLUG))!.accessRevision,
    });
    const sessionId = await initialize(app);
    const started = await callTool(app, 'start', { key }, { 'mcp-session-id': sessionId });
    expect(started.isError).toBe(false);
    expect(verifyMcpSessionKey((started.structured as { sessionKey: string }).sessionKey, secret)).toMatchObject({
      actorUid: EDITOR,
      actorRevision: (await store.getGameAccess(SLUG))!.accessRevision,
    });
  });

  it('binds the editor uid into start() sessionKey and refuses owner-only actions', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);

    const minted = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(EDITOR),
    });
    expect(minted.statusCode).toBe(200);
    const creatorKey = minted.json().key as string;

    const sessionId = await initialize(app);
    const started = await callTool(
      app,
      'start',
      { slug: SLUG },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${creatorKey}` },
    );
    expect(started.isError).toBe(false);
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;
    expect(verifyMcpSessionKey(sessionKey, secret)).toMatchObject({
      jobId: 55,
      actorUid: EDITOR,
    });

    const published = await callTool(
      app,
      'submit_sources',
      {
        sessionKey,
        kitEngineRef: 'abcdef0123456789abcdef0123456789abcdef01',
        mode: 'publish',
        files: [{ path: 'game.ts', content: 'export {};', encoding: 'utf8' }],
      },
      { 'mcp-session-id': sessionId },
    );
    expect(published.isError).toBe(true);
    expect((published.structured as { error: string }).error).toMatch(/only the owner can publish/i);
    // This reads as a permission problem, not a schema one.
    expect((published.structured as { code?: string }).code).toBe('not_owner');

    const shared = await callTool(app, 'share_draft', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(shared.isError).toBe(true);
    expect(shared.structured).toMatchObject({
      error: 'only the creator can share this game',
      code: 'not_owner',
    });
    expect((await store.getSubmission(55))?.draftSharedAt).toBeFalsy();

    await store.setDraftShared(55, AT);
    const unshared = await callTool(app, 'share_draft', { sessionKey, shared: false }, { 'mcp-session-id': sessionId });
    expect(unshared.isError).toBe(true);
    expect(unshared.structured).toMatchObject({ code: 'not_owner' });
    expect((await store.getSubmission(55))?.draftSharedAt).toBe(AT);
  });

  it('refuses leftover editor sessionKey after the owner removes them', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);

    const minted = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(EDITOR),
    });
    const creatorKey = minted.json().key as string;
    const sessionId = await initialize(app);
    const started = await callTool(
      app,
      'start',
      { slug: SLUG },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${creatorKey}` },
    );
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    expect(await store.removeEditor(SLUG, OWNER, EDITOR, AT)).toMatchObject({ editorUids: [] });

    const brief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(brief.isError).toBe(true);
    expect((brief.structured as { error: string }).error).toMatch(/can no longer write this game|finished/i);
  });

  it('keeps old sessions and uploads revoked after re-inviting the same editor', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);

    const minted = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(EDITOR),
    });
    const creatorKey = minted.json().key as string;
    const sessionId = await initialize(app);
    const started = await callTool(
      app,
      'start',
      { slug: SLUG },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${creatorKey}` },
    );
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const issued = await callTool(
      app,
      'screenshot_upload_url',
      { sessionKey, caption: 'before remove' },
      { 'mcp-session-id': sessionId },
    );
    expect(issued.isError).toBe(false);
    const upload = issued.structured as { url: string; upload: string };
    const url = upload.url.replace(/^https?:\/\/[^/]+/, '');

    expect(await store.removeEditor(SLUG, OWNER, EDITOR, AT)).toMatchObject({ editorUids: [] });
    const next = await store.createEditorInvitation(SLUG, OWNER, EDITOR, AT);
    expect(next).toMatchObject({ status: 'pending' });
    await store.acceptEditorInvitation(SLUG, EDITOR, AT, (next as { inviteId: string }).inviteId);
    const oldBrief = await callTool(app, 'get_brief', { sessionKey }, { 'mcp-session-id': sessionId });
    expect(oldBrief.isError).toBe(true);
    const fresh = await callTool(
      app,
      'start',
      { slug: SLUG },
      {
        'mcp-session-id': sessionId,
        authorization: `Bearer ${creatorKey}`,
      },
    );
    expect(fresh.isError).toBe(false);
    const freshKey = (fresh.structured as { sessionKey: string }).sessionKey;
    expect((await callTool(app, 'get_brief', { sessionKey: freshKey }, { 'mcp-session-id': sessionId })).isError).toBe(
      false,
    );

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const put = await app.inject({
      method: 'PUT',
      url,
      headers: {
        authorization: upload.upload.match(/-H 'Authorization: ([^']+)'/)?.[1] ?? '',
        'content-type': 'image/png',
      },
      payload: pngBytes,
    });
    expect(put.statusCode).toBe(401);
    expect(put.json()).toMatchObject({ error: expect.stringMatching(/finished/i) });
  });
  it('refuses a leftover editor upload URL after the owner removes them', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);

    const minted = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(EDITOR),
    });
    const creatorKey = minted.json().key as string;
    const sessionId = await initialize(app);
    const started = await callTool(
      app,
      'start',
      { slug: SLUG },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${creatorKey}` },
    );
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const issued = await callTool(
      app,
      'screenshot_upload_url',
      { sessionKey, caption: 'before remove' },
      { 'mcp-session-id': sessionId },
    );
    expect(issued.isError).toBe(false);
    const upload = issued.structured as { url: string; upload: string };
    const url = upload.url.replace(/^https?:\/\/[^/]+/, '');

    expect(await store.removeEditor(SLUG, OWNER, EDITOR, AT)).toMatchObject({ editorUids: [] });

    const pngBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const put = await app.inject({
      method: 'PUT',
      url,
      headers: {
        authorization: upload.upload.match(/-H 'Authorization: ([^']+)'/)?.[1] ?? '',
        'content-type': 'image/png',
      },
      payload: pngBytes,
    });
    expect(put.statusCode).toBe(401);
    expect(put.json()).toMatchObject({ error: expect.stringMatching(/finished/i) });
  });

  it('refuses fromLatestDelivery without mode when the previous lane cannot be proven preview', async () => {
    const store = new InMemoryStore();
    app = await createApp(store);
    await seedSharedRound(store);

    const minted = await app.inject({
      method: 'GET',
      url: '/api/me/creator-agent-key',
      headers: authHeaders(EDITOR),
    });
    const creatorKey = minted.json().key as string;
    const sessionId = await initialize(app);
    const started = await callTool(
      app,
      'start',
      { slug: SLUG },
      { 'mcp-session-id': sessionId, authorization: `Bearer ${creatorKey}` },
    );
    const sessionKey = (started.structured as { sessionKey: string }).sessionKey;

    const submitted = await callTool(
      app,
      'submit_sources',
      { sessionKey, kitEngineRef: 'abcdef0123456789abcdef0123456789abcdef01', fromLatestDelivery: true },
      { 'mcp-session-id': sessionId },
    );
    expect(submitted.isError).toBe(true);
    expect((submitted.structured as { error: string }).error).toMatch(/only the owner can publish/i);
  });
});
