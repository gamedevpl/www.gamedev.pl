import { readFile } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { mintAgentToken, mintManagedMcpOpener } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';
import { verdictPending } from './mcp-gate-task.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GitHubClient } from '../catalog/github-client.js';

const secret = 'test-secret';
const ISSUE = 55;
const ENGINE = 'abcdef0123456789abcdef0123456789abcdef01';
const MINIMAL_FILES = [
  { path: 'SPEC.md', content: '---\ntitle: Comet Courier\n---\n' },
  { path: 'game.ts', content: 'export {};' },
  {
    path: 'GAME.json',
    content: JSON.stringify({
      engine: { modules: [] },
      howToPlay: { goal: { en: 'Survive', pl: 'Przetrwaj' }, hint: { en: 'Keep moving', pl: 'Nie stój' } },
    }),
  },
];

// A gate whose manifest appears only once `done` is set.
function stubGamesStore(gate?: { status: string; report: string }) {
  const state = { done: false };
  const gamesStore = {
    putCandidateSources: async () => ({ version: 'v1', manifest: {} as never }),
    getManifest: async () =>
      gate && state.done
        ? { previewGate: { green: false, ranAt: '2026-08-01T12:00:00.000Z', report: gate.report } }
        : null,
    getSourceFile: async () => null,
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getDerivedArtifact: async () => null,
    getKitRegistry: async () => null,
    getStagedSourceFiles: async () => [],
    listStagedSources: async () => ({ files: [], totalBytes: 0, maxBytes: 1_500_000, maxFiles: 64 }),
    clearStagedSources: async () => ({ cleared: 0 }),
  } as unknown as GamesStore;
  return { gamesStore, state };
}

async function createApp(store: InMemoryStore, gamesStore?: GamesStore) {
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: {} as GitHubClient,
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: {
        ...(gamesStore ? { gamesStore } : {}),
        onSourcesDelivered: async () => ({ buildId: 'build-1' }),
      },
    },
  });
}

async function seedJob(store: InMemoryStore) {
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, 'comet-courier');
  await store.setSubmissionLocale(ISSUE, 'en');
  await store.setRoundBuilder(ISSUE, 'self');
  await store.setSubmissionBrief(ISSUE, { spec: 'Dodge debris while delivering parcels.', qa: [] });
}

const roundKey = () => mintAgentToken(ISSUE, secret, { roundGeneration: 1 });

async function legacyInitialize(app: FastifyInstance) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer handshake',
    },
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    },
  });
  return String(res.headers['mcp-session-id']);
}

describe('POST /api/mcp — MCP 2026-07-28 (skills, tasks)', () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  const TASKS = { 'io.modelcontextprotocol/tasks': {} };

  async function modernCall(
    target: FastifyInstance,
    method: string,
    params: Record<string, unknown> = {},
    options: { extensions?: Record<string, unknown>; headers?: Record<string, string>; version?: string } = {},
  ) {
    const version = options.version ?? '2026-07-28';
    const name =
      method === 'tools/call'
        ? String(params.name)
        : method === 'resources/read'
          ? String(params.uri)
          : method.startsWith('tasks/')
            ? String(params.taskId)
            : null;
    return target.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        // Like initialize, discovery needs a bearer; tool calls carry the sessionKey.
        ...(method === 'server/discover' ? { authorization: 'Bearer handshake' } : {}),
        'mcp-protocol-version': version,
        'mcp-method': method,
        ...(name !== null ? { 'mcp-name': name } : {}),
        ...options.headers,
      },
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': version,
            'io.modelcontextprotocol/clientInfo': { name: 'test', version: '0' },
            'io.modelcontextprotocol/clientCapabilities': options.extensions ? { extensions: options.extensions } : {},
          },
        },
      },
    });
  }

  async function modernStart(target: FastifyInstance, extensions?: Record<string, unknown>) {
    const res = await modernCall(
      target,
      'tools/call',
      { name: 'start', arguments: { key: roundKey() } },
      { extensions },
    );
    expect(res.statusCode).toBe(200);
    return (res.json().result.structuredContent as { sessionKey: string }).sessionKey;
  }

  it('answers server/discover with the skills and tasks extensions and no session id', async () => {
    app = await createApp(new InMemoryStore());
    const res = await modernCall(app, 'server/discover');
    expect(res.statusCode).toBe(200);
    expect(res.headers['mcp-session-id']).toBeUndefined();
    const result = res.json().result;
    expect(result).toMatchObject({
      resultType: 'complete',
      supportedVersions: ['2026-07-28'],
      capabilities: {
        tools: {},
        resources: {},
        extensions: { 'io.modelcontextprotocol/skills': {}, 'io.modelcontextprotocol/tasks': {} },
      },
      cacheScope: 'public',
    });
    expect(result._meta['io.modelcontextprotocol/serverInfo']).toMatchObject({ name: 'gamedevpl' });
    expect(typeof result.instructions).toBe('string');
  });

  it('keeps the legacy initialize flow byte-for-byte separate', async () => {
    app = await createApp(new InMemoryStore());
    const sessionId = await legacyInitialize(app);
    const listed = await app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      payload: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    });
    expect(listed.json().result.resultType).toBeUndefined();
    expect(listed.json().result.ttlMs).toBeUndefined();
  });

  it('refuses unsupported versions and mismatched headers with the modern error codes', async () => {
    app = await createApp(new InMemoryStore());
    const old = await modernCall(app, 'tools/list', {}, { version: '1900-01-01' });
    expect(old.statusCode).toBe(400);
    expect(old.json().error).toMatchObject({ code: -32022, data: { requested: '1900-01-01' } });
    expect(old.json().error.data.supported).toEqual(expect.arrayContaining(['2026-07-28', '2025-11-25']));

    const mismatch = await modernCall(app, 'tools/list', {}, { headers: { 'mcp-method': 'tools/call' } });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json().error.code).toBe(-32020);

    const noName = await modernCall(
      app,
      'resources/read',
      { uri: 'skill://gamedevpl/SKILL.md' },
      { headers: { 'mcp-name': 'skill://other/SKILL.md' } },
    );
    expect(noName.json().error.code).toBe(-32020);

    const unknown = await modernCall(app, 'prompts/list');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe(-32601);
  });

  it('lists tools with the cache fields the revision requires', async () => {
    app = await createApp(new InMemoryStore());
    const res = await modernCall(app, 'tools/list');
    const result = res.json().result;
    expect(result).toMatchObject({ resultType: 'complete', ttlMs: expect.any(Number), cacheScope: 'private' });
    expect((result.tools as Array<{ name: string }>).map((t) => t.name)).toContain('submit_sources');
  });

  it('serves the gamedevpl skill: list, get and read agree with the file on disk', async () => {
    app = await createApp(new InMemoryStore());
    const onDisk = await readFile(new URL('../../../../skills/gamedevpl/SKILL.md', import.meta.url), 'utf8');

    const listed = (await modernCall(app, 'skills/list')).json().result;
    expect(listed).toMatchObject({ resultType: 'complete', cacheScope: 'public' });
    expect(listed.skills).toHaveLength(1);
    const [skill] = listed.skills;
    expect(skill.uri).toBe('skill://gamedevpl/SKILL.md');
    expect(skill.frontmatter.name).toBe('gamedevpl');
    expect(skill.frontmatter.description).toMatch(/gamedev\.pl/);
    expect(skill.resources).toEqual([
      { uri: skill.uri, digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/), size: Buffer.byteLength(onDisk) },
    ]);

    const got = (await modernCall(app, 'skills/get', { uri: skill.uri })).json().result;
    expect(got.skill).toEqual(skill);

    const read = (await modernCall(app, 'resources/read', { uri: skill.uri })).json().result;
    expect(read.contents).toEqual([{ uri: skill.uri, mimeType: 'text/markdown', text: onDisk }]);
    expect(read.ttlMs).toBeGreaterThan(0);

    const missing = await modernCall(app, 'resources/read', { uri: 'skill://gamedevpl/references/none.md' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe(-32602);
  });

  it('runs a delivery as a task that completes with the gate verdict', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const { gamesStore, state } = stubGamesStore({
      status: 'preview_failed',
      report: 'smoke: the canvas stayed black',
    });
    app = await createApp(store, gamesStore);
    const sessionKey = await modernStart(app, TASKS);

    const submitted = await modernCall(
      app,
      'tools/call',
      {
        name: 'submit_sources',
        arguments: { sessionKey, kitEngineRef: ENGINE, files: MINIMAL_FILES.map((f) => ({ ...f, encoding: 'utf8' })) },
      },
      { extensions: TASKS },
    );
    expect(submitted.statusCode).toBe(200);
    const task = submitted.json().result;
    expect(task).toMatchObject({
      resultType: 'task',
      status: 'working',
      ttlMs: expect.any(Number),
      pollIntervalMs: expect.any(Number),
      createdAt: expect.any(String),
      lastUpdatedAt: expect.any(String),
    });
    // The sessionKey inside the id is encrypted, not merely encoded.
    expect(task.taskId).not.toContain(sessionKey);
    expect(Buffer.from(task.taskId.slice(4), 'base64url').toString('latin1')).not.toContain(sessionKey);

    const working = (await modernCall(app, 'tasks/get', { taskId: task.taskId }, { extensions: TASKS })).json().result;
    expect(working).toMatchObject({ resultType: 'complete', taskId: task.taskId, status: 'working' });
    expect(working.result).toBeUndefined();

    // A note the creator sends mid-gate rides the completed result.
    const note = await store.appendCreatorMessage(ISSUE, 'Make the ship blue');
    state.done = true;
    const done = (await modernCall(app, 'tasks/get', { taskId: task.taskId }, { extensions: TASKS })).json().result;
    expect(done).toMatchObject({ resultType: 'complete', status: 'completed' });
    const verdict = done.result.structuredContent;
    expect(verdict).toMatchObject({
      ok: true,
      mode: 'preview',
      deliveryId: expect.any(String),
      gateStarted: true,
      gate: { status: 'preview_failed' },
    });
    expect((verdict.warnings as Array<{ code: string }>).map((w) => w.code)).toContain('must_fix_gate');
    expect((verdict.pendingMessages as Array<{ id: string }>).map((m) => m.id)).toEqual([note.id]);

    // The completed result still carries submit_sources' required success fields.
    const listed = (await modernCall(app, 'tools/list')).json().result;
    const schema = (
      listed.tools as Array<{ name: string; outputSchema: { anyOf: Array<{ required: string[] }> } }>
    ).find((t) => t.name === 'submit_sources')!.outputSchema;
    for (const field of schema.anyOf[0]!.required) expect(verdict).toHaveProperty(field);
  });

  it('answers submit_sources inline for a client without the tasks extension', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    const { gamesStore } = stubGamesStore();
    app = await createApp(store, gamesStore);
    const sessionKey = await modernStart(app);
    const submitted = await modernCall(app, 'tools/call', {
      name: 'submit_sources',
      arguments: { sessionKey, kitEngineRef: ENGINE, files: MINIMAL_FILES.map((f) => ({ ...f, encoding: 'utf8' })) },
    });
    const result = submitted.json().result;
    expect(result.resultType).toBe('complete');
    expect(result.structuredContent).toMatchObject({ ok: true, gateStarted: true });

    const refused = await modernCall(app, 'tasks/get', { taskId: 'gt1.x' });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toMatchObject({
      code: -32021,
      data: { requiredCapabilities: { extensions: { 'io.modelcontextprotocol/tasks': {} } } },
    });
  });

  it('refuses a forged or tampered taskId as unknown', async () => {
    app = await createApp(new InMemoryStore());
    for (const taskId of ['gt1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'not-a-task']) {
      const res = await modernCall(app, 'tasks/get', { taskId }, { extensions: TASKS });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe(-32602);
    }
  });

  it('keeps a rate-limited verdict read pending and ends on any other refusal', () => {
    const refusal = (error: string) => ({ content: [], structuredContent: { error }, isError: true });
    expect(verdictPending(refusal('gate verdict failed (429)'))).toBe(true);
    expect(verdictPending(refusal('Rate limit exceeded, retry in 1 minute'))).toBe(true);
    expect(verdictPending(refusal('stale agent token'))).toBe(false);
    expect(verdictPending({ content: [], structuredContent: { status: 'pending' } })).toBe(true);
    expect(verdictPending({ content: [], structuredContent: { status: 'preview_failed' } })).toBe(false);
  });

  it('serves a managed builder the base revision only: no skills, no gate task', async () => {
    const store = new InMemoryStore();
    await seedJob(store);
    await store.setRoundBuilder(ISSUE, 'platform');
    const { gamesStore } = stubGamesStore();
    app = await createApp(store, gamesStore);
    const authorization = `Bearer ${mintManagedMcpOpener(ISSUE, secret, { roundGeneration: 1 })}`;
    const managed = { extensions: TASKS, headers: { authorization } };

    const discovered = (await modernCall(app, 'server/discover', {}, managed)).json().result;
    expect(discovered.capabilities).toEqual({ tools: {}, extensions: {} });
    expect((await modernCall(app, 'skills/list', {}, managed)).statusCode).toBe(404);

    const started = await modernCall(
      app,
      'tools/call',
      { name: 'start', arguments: { slug: 'comet-courier' } },
      managed,
    );
    const sessionKey = (started.json().result.structuredContent as { sessionKey: string }).sessionKey;
    const submitted = await modernCall(
      app,
      'tools/call',
      {
        name: 'submit_sources',
        arguments: { sessionKey, kitEngineRef: ENGINE, files: MINIMAL_FILES.map((f) => ({ ...f, encoding: 'utf8' })) },
      },
      managed,
    );
    expect(submitted.json().result).toMatchObject({ resultType: 'complete', structuredContent: { ok: true } });
  });
});
