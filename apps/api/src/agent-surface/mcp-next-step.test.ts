import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { mintAgentToken } from '../platform/agent-token.js';
import { buildApp } from '../platform/app.js';
import { InMemoryStore } from '../platform/store.js';

// nextSuggestedTool at each point of a real round, via the endpoint.

const secret = 'test-secret';
const ISSUE = 55;
const OLD_ENGINE = 'a'.repeat(40);
const NEW_ENGINE = 'b'.repeat(40);
const SHELL_COMMAND = /\b(curl|wget)\s|--upload-file|--use-gl|\bnpm run\b|\bnpx\s/i;
const FILES = [
  { path: 'game.ts', content: 'export {};' },
  { path: 'TRACE.json', content: '{"samples":[]}' },
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
  {
    path: 'GAME.json',
    content: JSON.stringify({
      engine: { modules: [] },
      howToPlay: { goal: { en: 'Survive', pl: 'Przetrwaj' }, hint: { en: 'Move', pl: 'Ruszaj' } },
    }),
  },
];

type Gate = { lane: 'preview' | 'publish'; status: string };
type Reply = {
  isError: boolean;
  warnings: Array<{ code: string; message: string }>;
  next?: string;
  data: Record<string, unknown>;
};

// Enough games store for staging, delivery and one verdict.
function gamesStoreWith(gate?: Gate) {
  const staged = new Map<string, string>();
  const submitted: Array<{ mode?: string }> = [];
  const listing = () => {
    const files = [...staged].map(([path, content]) => ({ path, bytes: Buffer.byteLength(content) }));
    return { files, totalBytes: files.reduce((n, f) => n + f.bytes, 0), maxBytes: 1_500_000, maxFiles: 64 };
  };
  const verdict = gate ? { green: false, ranAt: '2026-10-01T00:00:00.000Z', status: gate.status } : undefined;
  const gamesStore = {
    putCandidateSources: async (input: { mode?: string }) => {
      submitted.push(input);
      return { version: 'v2', manifest: {} as never };
    },
    getManifest: async () =>
      gate
        ? {
            sourceFiles: FILES.map((f) => f.path),
            deliveryMode: gate.lane,
            ...(gate.lane === 'preview' ? { previewGate: verdict } : { gate: verdict }),
          }
        : null,
    getSourceFile: async (_slug: string, _version: string, path: string) =>
      FILES.find((f) => f.path === path)?.content ?? null,
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getDerivedArtifact: async () => null,
    getKitRegistry: async () => null,
    putStagedSourceFile: async (input: { path: string; content: string }) => {
      staged.set(input.path, input.content);
      return { path: input.path, bytes: Buffer.byteLength(input.content), ...listing(), updatedAt: 'now' };
    },
    getStagedSourceFiles: async () => [...staged].map(([path, content]) => ({ path, content })),
    getStagedSourceFile: async (input: { path: string }) => staged.get(input.path) ?? null,
    deleteStagedSourceFile: async (input: { path: string }) => {
      staged.delete(input.path);
      return { path: input.path, ...listing(), updatedAt: 'now' };
    },
    listStagedSources: async () => listing(),
    clearStagedSources: async () => {
      const cleared = staged.size;
      staged.clear();
      return { cleared };
    },
  } as unknown as GamesStore;
  return { gamesStore, submitted };
}

// A kit registry whose current engine outdates the round's pin.
const kitStore: GcsObjectStore = {
  readObject: async (name: string) =>
    name === 'kits/current.json'
      ? Buffer.from(JSON.stringify({ current: NEW_ENGINE, previous: OLD_ENGINE, updatedAt: '2026-10-01T00:00:00Z' }))
      : name.startsWith('kits/') && name.endsWith('.json')
        ? Buffer.from(JSON.stringify({ sha256: 'c'.repeat(64), packedAt: '2026-10-01T00:00:00Z' }))
        : null,
  objectExists: async () => true,
  signReadUrl: async (name: string) => `https://signed.example/${name}?sig=1`,
};

describe('nextSuggestedTool through the MCP endpoint', () => {
  let app: FastifyInstance;
  let store: InMemoryStore;
  let sessionId: string;
  let sessionKey: string;
  afterEach(async () => {
    await app?.close();
  });

  async function round(options: { gate?: Gate; kit?: boolean } = {}) {
    store = new InMemoryStore();
    await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
    await store.setSubmissionSlug(ISSUE, 'comet-courier');
    await store.setSubmissionLocale(ISSUE, 'en');
    await store.setRoundBuilder(ISSUE, 'self');
    await store.setSubmissionBrief(ISSUE, { spec: 'Dodge debris while delivering parcels.', qa: [] });
    await store.recordJobTransition(ISSUE, { to: 'dispatched', at: new Date().toISOString(), by: 'system' });
    const games = gamesStoreWith(options.gate);
    app = await buildApp({
      store,
      sessionSecret: 'dev-session-secret-change-me',
      submissionRoutes: {
        githubClient: {} as GitHubClient,
        githubToken: 'gh-token',
        submissionTokenSecret: secret,
        agentChannel: {
          gamesStore: games.gamesStore,
          ...(options.kit ? { objectStore: kitStore } : {}),
          onSourcesDelivered: async () => ({ accepted: true, buildId: 'build-1' }),
        },
      },
    });
    const init = await post('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    sessionId = String(init.headers['mcp-session-id']);
    return games;
  }

  function post(method: string, params: unknown) {
    return app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(method === 'initialize' ? { authorization: 'Bearer handshake' } : { 'mcp-session-id': sessionId }),
      },
      payload: { jsonrpc: '2.0', id: 1, method, params },
    });
  }

  async function call(name: string, args: Record<string, unknown> = {}): Promise<Reply> {
    const res = await post('tools/call', { name, arguments: { ...(sessionKey ? { sessionKey } : {}), ...args } });
    const result = res.json().result as { structuredContent?: Record<string, unknown>; isError?: boolean };
    const data = result.structuredContent ?? {};
    const warnings = (data.warnings as Reply['warnings'] | undefined) ?? [];
    // Runtime warnings are server text too: never a command.
    for (const warning of warnings) expect(warning.message, warning.code).not.toMatch(SHELL_COMMAND);
    return { isError: Boolean(result.isError), warnings, next: data.nextSuggestedTool as string | undefined, data };
  }

  async function start() {
    sessionKey = '';
    const started = await call('start', { key: mintAgentToken(ISSUE, secret, { roundGeneration: 1 }) });
    sessionKey = String(started.data.sessionKey);
    return started;
  }

  const codes = (reply: Reply) => reply.warnings.map((warning) => warning.code);

  it('A: an unread creator message comes before anything else, never a delivery', async () => {
    await round();
    await store.appendCreatorMessage(ISSUE, 'Make the ship blue');
    expect((await start()).next).not.toBe('submit_sources');
    const sources = await call('get_sources');
    expect(codes(sources)).toEqual(expect.arrayContaining(['must_deliver', 'inbox_pending']));
    expect(sources.next).toBe('read_inbox');
  });

  it('B: once the message is read, unfinished staging suggests nothing', async () => {
    await round();
    await store.appendCreatorMessage(ISSUE, 'Make the ship blue');
    await start();
    await call('read_inbox');
    const staged = await call('stage_source_file', { path: 'game.ts', content: 'export const ship = "blue";' });
    expect(codes(staged)).toContain('must_deliver');
    // Read, not acknowledged: no read_inbox loop, no premature submit.
    expect(staged.next).toBeUndefined();
  });

  it('C: writing the first file, or reporting progress, is not readiness to submit', async () => {
    await round();
    await start();
    const progress = await call('report_progress', { text: 'Reading the brief.', step: 'planning' });
    expect(codes(progress)).toContain('must_deliver');
    expect(progress.next).toBeUndefined();
    const staged = await call('stage_source_file', { path: 'game.ts', content: 'export const draft = 1;' });
    expect(codes(staged)).toContain('must_deliver');
    expect(staged.next).toBeUndefined();
  });

  it('D: resuming after preview_failed reads before it fixes, and never suggests a resubmit', async () => {
    await round({ gate: { lane: 'preview', status: 'preview_failed' } });
    await store.setSubmissionPreviewVersion(ISSUE, 'v1');
    const started = await start();
    expect(codes(started)).toContain('must_fix_gate');
    expect(started.next).toBe('get_brief');
    const progress = await call('report_progress', { text: 'Reading the gate report.', step: 'fixing' });
    expect(codes(progress)).toContain('must_fix_gate');
    expect(progress.next).toBeUndefined();
  });

  it('E: kit_outdated refreshes the kit first, keeps the lane, and does not loop on get_kit', async () => {
    const games = await round({ gate: { lane: 'publish', status: 'kit_outdated' }, kit: true });
    await store.setSubmissionDeliveredVersion(ISSUE, 'v1');
    await store.pinRoundKitEngineRef(ISSUE, OLD_ENGINE);
    const started = await start();
    expect(started.next).toBe('get_kit');
    const refusal = started.warnings.find((warning) => warning.code === 'must_fix_gate')?.message ?? '';
    expect(refusal).toMatch(/fromLatestDelivery/);
    const kit = await call('get_kit');
    expect(kit.data).toMatchObject({ engineRef: NEW_ENGINE, kitEngineChanged: true });
    expect(kit.next).toBeUndefined();
    expect((await call('report_progress', { text: 'Kit refreshed.', step: 'fixing' })).next).toBeUndefined();
    const resent = await call('submit_sources', { fromLatestDelivery: true, kitEngineRef: NEW_ENGINE });
    expect(resent.data).toMatchObject({ ok: true, mode: 'publish' });
    expect(games.submitted.at(-1)?.mode).toBe('publish');
  });

  it('F: a partly failed patch suggests nothing until the edit is finished', async () => {
    await round();
    await start();
    await call('stage_source_file', { path: 'game.ts', content: 'const a = 1;\nconst b = 2;\n' });
    const patched = await call('patch_source_file', {
      path: 'game.ts',
      patches: [
        { old: 'const a = 1;', new: 'const a = 3;' },
        { old: 'const missing = 0;', new: 'const missing = 1;' },
      ],
    });
    expect(codes(patched)).toEqual(expect.arrayContaining(['patch_incomplete', 'must_deliver']));
    expect(patched.next).toBeUndefined();
  });

  it('G: a successful delivery points at end, and end closes the session', async () => {
    await round();
    await start();
    for (const file of FILES) await call('stage_source_file', file);
    const delivered = await call('submit_sources', { fromStaged: true, mode: 'preview', kitEngineRef: NEW_ENGINE });
    expect(delivered.data).toMatchObject({ ok: true, mode: 'preview' });
    expect(codes(delivered)).toContain('call_end');
    expect(delivered.next).toBe('end');
    // Staging after delivering is new work, not a close.
    expect((await call('stage_source_file', { path: 'game.ts', content: 'export const v = 2;' })).next).toBeUndefined();
    const ended = await call('end', { summary: 'Delivered the first playable draft.' });
    expect(ended.isError).toBe(false);
    expect(ended.data).toMatchObject({ ended: true, stop: true });
    expect(ended.next).toBeUndefined();
  });

  it('H: a pending gate and a builder handoff both point at end, following stop and reason', async () => {
    await round();
    await start();
    for (const file of FILES) await call('stage_source_file', file);
    await call('submit_sources', { fromStaged: true, mode: 'preview', kitEngineRef: NEW_ENGINE });
    await store.setSubmissionPreviewVersion(ISSUE, 'v2');
    const verdict = await call('get_gate_verdict');
    expect(verdict.data).toMatchObject({ stop: true, reason: 'gate_pending' });
    expect(verdict.next).toBe('end');

    await store.requestBuilderHandoff(ISSUE, 'platform', new Date().toISOString(), true);
    const handed = await call('report_progress', { text: 'Still here.', step: 'fixing' });
    expect(handed.data).toMatchObject({ stop: true, reason: 'builder_handoff' });
    expect(handed.next).toBe('end');
  });

  it('I: a question round can end with an answer and no delivery', async () => {
    await round();
    await start();
    const progress = await call('report_progress', { text: 'Looking at the question.', step: 'planning' });
    expect(codes(progress)).toContain('must_deliver');
    expect(progress.next).not.toBe('submit_sources');
    const ended = await call('end', { summary: 'It is an arcade game; nothing needs to change.' });
    expect(ended.isError).toBe(false);
    expect(ended.data).toMatchObject({ ended: true, summaryShown: true });
  });
});
