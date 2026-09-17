import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import { enableCliSurface, mintCreatorTokens, SESSION_SECRET } from '../platform/oauth-cli-test-app.js';
import { InMemoryStore } from '../platform/store.js';
import { mintCreatorAgentKey } from './agent-creator-key.js';
import { mintGameAgentKey } from './agent-game-key.js';
import { mintMcpSessionKey } from './mcp-session-key.js';
import { MCP_UNADVERTISED_TOOLS } from './mcp-server.js';
import { GAME_UNAVAILABLE, OWNERSHIP_SCOPE_REQUIRED } from './mcp-ownership-tools.js';
import { PLATFORM_CONNECTOR_ONLY_REASON, RETIRED_GAME_KEY_REASON } from './mcp-tool-support.js';
import { memberKey } from '../platform/game-access-permissions.js';

const SECRET = 'oauth-cli-mcp-secret';
const CONNECTOR = 'test-connector-secret-32-chars-min';
const AT = '2026-01-01T00:00:00.000Z';
const OWNER = 'g:ada';
const EDITOR = 'g:bea';
const OTHER = 'g:cal';
const SLUG = 'sky';

let restoreCli: () => void;

beforeAll(() => {
  restoreCli = enableCliSurface();
  return () => restoreCli();
});

async function createApp(store: InMemoryStore) {
  return buildApp({
    store,
    sessionSecret: SESSION_SECRET,
    platformConnectorSecret: CONNECTOR,
    submissionRoutes: {
      githubClient: { createIssue: async () => ({ number: 42 }) } as never,
      githubToken: 'gh',
      submissionTokenSecret: SECRET,
      agentChannel: {},
    },
  });
}

async function seedOwner(store: InMemoryStore) {
  await store.upsertUser({ uid: OWNER });
  await store.upsertUser({ uid: EDITOR });
  await store.upsertUser({ uid: OTHER });
  await store.updateCreatorProfile(OWNER, { profileName: 'Ada' });
  await store.updateCreatorProfile(EDITOR, { profileName: 'Bea' });
  await store.ensureGameAccess(SLUG, OWNER, AT, AT);
}

function dropCanonicalAccess(store: InMemoryStore, slug: string): void {
  (store as unknown as { gameAccessStore: { access: Map<string, unknown> } }).gameAccessStore.access.delete(slug);
}

async function acceptEditor(store: InMemoryStore) {
  const code = (await store.ensureRecipientCode(EDITOR, AT))!;
  await store.createEditorInvitation(SLUG, OWNER, EDITOR, AT, code);
  const invite = (await store.getEditorInvite(SLUG, EDITOR, AT))!;
  await store.acceptEditorInvitation(SLUG, EDITOR, AT, invite.inviteId);
}

async function mcpCall(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
}

async function callTool(
  app: FastifyInstance,
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const res = await mcpCall(app, name, args, headers);
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text: string }> };
  };
  const structured =
    body.result?.structuredContent ??
    (body.result?.content?.[0]?.text ? (JSON.parse(body.result.content[0].text) as Record<string, unknown>) : {});
  return { structured, isError: Boolean(body.result?.isError), raw: JSON.stringify(body) };
}

async function token(app: FastifyInstance, uid: string, scope: string, device = `dev-${uid}`) {
  return (await mintCreatorTokens(app, { uid, scope, device })).access_token;
}

describe('MCP ownership tools', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function ready(scope = 'mcp ownership') {
    const store = new InMemoryStore();
    await seedOwner(store);
    const app = await createApp(store);
    apps.push(app);
    const bearer = await token(app, OWNER, scope);
    return { store, app, bearer };
  }

  it('advertises the three tools', async () => {
    const { app } = await ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    const names = (res.json().result.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['get_game_access', 'propose_game_transfer', 'get_game_transfer_proposal_receipt']),
    );
  });

  it('refuses missing, wrong, and disallowed credentials', async () => {
    const { app, store } = await ready();
    await store.ensureCreatorAgentKey(OWNER, AT);
    const creatorKey = mintCreatorAgentKey(SECRET, { creatorUid: OWNER, keyGeneration: 1, now: Date.now() });
    const gameKey = mintGameAgentKey(SECRET, { slug: SLUG, creatorUid: OWNER, keyGeneration: 1, now: Date.now() });
    const sessionKey = mintMcpSessionKey(SECRET, { sessionId: 's1', jobId: 1, roundGeneration: 1 });
    const roundKey = mintAgentToken(1, SECRET, { roundGeneration: 1 });
    const mcpOnly = await token(app, OWNER, 'mcp', 'mcp-only');
    const creatorOnly = await token(app, OWNER, 'creator', 'creator-only');
    const mcpCreator = await token(app, OWNER, 'mcp creator', 'mcp-creator');
    const unauth = await mcpCall(app, 'get_game_access', { slug: SLUG });
    expect(unauth.statusCode).toBe(401);
    const sessionOnly = await callTool(app, 'get_game_access', { slug: SLUG, sessionKey: 's1' });
    expect(sessionOnly.isError).toBe(true);
    expect(JSON.stringify(sessionOnly.structured)).toContain(OWNERSHIP_SCOPE_REQUIRED);
    const cases: Array<[Record<string, string>, Record<string, unknown>, string]> = [
      [{ authorization: `Bearer ${CONNECTOR}` }, { slug: SLUG }, PLATFORM_CONNECTOR_ONLY_REASON],
      [{ authorization: `Bearer ${gameKey}` }, { slug: SLUG }, RETIRED_GAME_KEY_REASON],
      [{ authorization: `Bearer ${sessionKey}` }, { slug: SLUG }, OWNERSHIP_SCOPE_REQUIRED],
      [{ authorization: `Bearer ${roundKey}` }, { slug: SLUG }, OWNERSHIP_SCOPE_REQUIRED],
      [{ authorization: `Bearer ${creatorKey}` }, { slug: SLUG }, 'creator API keys cannot use ownership tools'],
      [{ authorization: `Bearer ${mcpOnly}` }, { slug: SLUG }, OWNERSHIP_SCOPE_REQUIRED],
      [{ authorization: `Bearer ${mcpOnly}` }, { slug: SLUG, sessionKey: 's' }, OWNERSHIP_SCOPE_REQUIRED],
      [{ authorization: `Bearer ${creatorOnly}` }, { slug: SLUG }, OWNERSHIP_SCOPE_REQUIRED],
      [{ authorization: `Bearer ${mcpCreator}` }, { slug: SLUG }, OWNERSHIP_SCOPE_REQUIRED],
    ];
    for (const [headers, args, reason] of cases) {
      const { structured, isError } = await callTool(app, 'get_game_access', args, headers);
      expect(isError).toBe(true);
      expect(JSON.stringify(structured)).toContain(reason);
    }
  });

  it('returns the same refusal for a missing game, a derived game, and a stranger', async () => {
    const { app, store, bearer } = await ready();
    await store.createSubmission(9, OWNER, 'Legacy');
    await store.setSubmissionSlug(9, 'legacy-sky');
    dropCanonicalAccess(store, 'legacy-sky');
    const auth = { authorization: `Bearer ${bearer}` };
    const missing = await callTool(app, 'get_game_access', { slug: 'no-such-game' }, auth);
    const derived = await callTool(app, 'get_game_access', { slug: 'legacy-sky' }, auth);
    const otherToken = await token(app, OTHER, 'mcp ownership', 'other');
    const stranger = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${otherToken}` });
    for (const result of [missing, derived, stranger]) {
      expect(result.isError).toBe(true);
      expect(result.structured).toMatchObject({ error: GAME_UNAVAILABLE });
    }
  });

  it('accepts an ownership-only grant without silently needing mcp', async () => {
    const { app } = await ready();
    const ownershipOnly = await token(app, OWNER, 'ownership', 'own-only');
    const { structured, isError } = await callTool(
      app,
      'get_game_access',
      { slug: SLUG },
      { authorization: `Bearer ${ownershipOnly}` },
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({ slug: SLUG, viewerRole: 'owner', accessVersion: 'v1' });
  });

  it('lets a current member read opaque metadata and never leaks uids or codes', async () => {
    const { app, store, bearer } = await ready();
    await acceptEditor(store);
    const { structured, isError, raw } = await callTool(
      app,
      'get_game_access',
      { slug: SLUG },
      { authorization: `Bearer ${bearer}` },
    );
    expect(isError).toBe(false);
    expect(structured).toMatchObject({
      slug: SLUG,
      viewerRole: 'owner',
      accessVersion: 'v2',
    });
    expect(structured.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ memberKey: memberKey(SLUG, OWNER), role: 'owner', profileName: 'Ada' }),
        expect.objectContaining({ memberKey: memberKey(SLUG, EDITOR), role: 'editor', profileName: 'Bea' }),
      ]),
    );
    expect(raw).not.toContain(OWNER);
    expect(raw).not.toContain(EDITOR);
    const editorToken = await token(app, EDITOR, 'mcp ownership', 'editor');
    const editor = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${editorToken}` });
    expect(editor.structured.viewerRole).toBe('editor');
    expect(editor.structured.permittedActions).not.toContain('transfer');
  });

  it('drops a removed editor and does not restore rights after reinvite', async () => {
    const { app, store, bearer } = await ready();
    await acceptEditor(store);
    await store.removeEditor(SLUG, OWNER, EDITOR, AT);
    const editorToken = await token(app, EDITOR, 'mcp ownership', 'editor-2');
    const gone = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${editorToken}` });
    expect(gone.structured).toMatchObject({ error: GAME_UNAVAILABLE });
    const owner = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${bearer}` });
    expect(owner.isError).toBe(false);
    expect(owner.structured.permittedActions).toEqual(expect.arrayContaining(['build', 'transfer']));
    await acceptEditor(store);
    const back = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${editorToken}` });
    expect(back.structured.viewerRole).toBe('editor');
    expect(back.structured.accessVersion).not.toBe(owner.structured.accessVersion);
  });

  it('prepares a same-origin proposal without a recipient or secret', async () => {
    const { app, bearer } = await ready();
    const proposed = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(proposed.isError).toBe(false);
    expect(String(proposed.structured.reviewUrl)).toMatch(
      /^https:\/\/www\.gamedev\.pl\/studio\/sky\/transfer\/propose\/[0-9a-f-]{36}$/,
    );
    expect(proposed.raw).not.toContain(OWNER);
    const replay = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(replay.structured.proposalId).toBe(proposed.structured.proposalId);
    const receipt = await callTool(
      app,
      'get_game_transfer_proposal_receipt',
      { idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(receipt.structured).toMatchObject({
      status: 'ready',
      proposalId: proposed.structured.proposalId,
    });
  });

  it('reports a confirmed proposal instead of treating it as invalidated', async () => {
    const { app, store, bearer } = await ready();
    const proposed = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k-sent' },
      { authorization: `Bearer ${bearer}` },
    );
    await store.confirmTransferProposal(String(proposed.structured.proposalId), OWNER, AT);
    const receipt = await callTool(
      app,
      'get_game_transfer_proposal_receipt',
      { idempotencyKey: 'k-sent' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(receipt.structured).toEqual({ status: 'confirmed' });
  });

  it('conflicts when the same key is reused after access changes', async () => {
    const { app, store, bearer } = await ready();
    await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    await acceptEditor(store);
    const clash = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v2', idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(clash.structured).toMatchObject({ error: 'idempotency_conflict' });
  });

  it('refuses an editor propose and a stale access version', async () => {
    const { app, store } = await ready();
    await acceptEditor(store);
    const editorToken = await token(app, EDITOR, 'mcp ownership', 'editor-3');
    const editor = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v2', idempotencyKey: 'k-ed' },
      { authorization: `Bearer ${editorToken}` },
    );
    expect(editor.structured).toMatchObject({ error: GAME_UNAVAILABLE });
    const ownerToken = await token(app, OWNER, 'mcp ownership', 'owner-stale');
    const stale = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k-stale' },
      { authorization: `Bearer ${ownerToken}` },
    );
    expect(stale.structured).toMatchObject({ error: 'stale_access_version' });
  });

  it('lets unadvertised tools be called but not as ownership', async () => {
    const { app, bearer } = await ready();
    for (const name of MCP_UNADVERTISED_TOOLS) {
      const result = await callTool(app, name, { slug: SLUG }, { authorization: `Bearer ${bearer}` });
      expect(result.raw).not.toContain('reviewUrl');
      expect(result.structured.proposalId).toBeUndefined();
    }
  });

  it('hides an erased owner propose behind the same refusal', async () => {
    const { app, store, bearer } = await ready();
    await store.beginAccountErasure(OWNER, '2099-01-01T00:00:00.000Z');
    const refused = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k-erased' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(refused.structured).toMatchObject({ error: GAME_UNAVAILABLE });
  });

  it('lets a new key proceed after membership bumps the access version', async () => {
    const { app, store, bearer } = await ready();
    await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v1', idempotencyKey: 'k1' },
      { authorization: `Bearer ${bearer}` },
    );
    await acceptEditor(store);
    const next = await callTool(
      app,
      'propose_game_transfer',
      { slug: SLUG, expectedAccessVersion: 'v2', idempotencyKey: 'k2' },
      { authorization: `Bearer ${bearer}` },
    );
    expect(next.isError).toBe(false);
    expect(next.structured.accessVersion).toBe('v2');
  });

  it('treats a recreated editor as a stranger until they are invited again', async () => {
    const { app, store } = await ready();
    await acceptEditor(store);
    await store.deleteAccountIdentity(EDITOR, AT);
    await store.upsertUser({ uid: EDITOR });
    const editorToken = await token(app, EDITOR, 'mcp ownership', 'editor-recreated');
    const gone = await callTool(app, 'get_game_access', { slug: SLUG }, { authorization: `Bearer ${editorToken}` });
    expect(gone.structured).toMatchObject({ error: GAME_UNAVAILABLE });
  });
});
