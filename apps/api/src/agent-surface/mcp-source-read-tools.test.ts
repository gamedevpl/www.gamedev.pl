import type { FastifyInstance } from 'fastify';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintAgentToken } from '../platform/agent-token.js';
import { InMemoryStore } from '../platform/store.js';
import { readTarEntries } from '../platform/tar.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { CatalogGameEntry, GameSources, GitHubClient, LinkedPullRequest } from '../catalog/github-client.js';
import { INLINE_SOURCES_MAX_CHARS } from './mcp-source-read-tools.js';
import { sha256Hex } from './source-archive.js';

const secret = 'source-read-secret';
const ISSUE = 91;
const SLUG = 'comet-courier';

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

// Round 0 serves the seed, so no version is ever read.
const gamesStore = { getManifest: async () => null, getSourceFile: async () => null } as unknown as GamesStore;

const big = (marker: string) =>
  `// ${marker}\n${'export const x = 1;\n'.repeat(Math.ceil(INLINE_SOURCES_MAX_CHARS / 20))}`;
const SEED_FILES = [
  { path: 'GAME.json', content: '{"title":"Comet Courier"}' },
  { path: 'game.ts', content: big('entry') },
  { path: 'game/runtime.ts', content: big('runtime') },
];

async function setup(files = SEED_FILES) {
  const store = new InMemoryStore();
  await store.createSubmission(ISSUE, 'g:owner', 'Comet Courier');
  await store.setSubmissionSlug(ISSUE, SLUG);
  await store.setSubmissionLocale(ISSUE, 'en');
  await store.setRoundBuilder(ISSUE, 'self');
  await store.setSubmissionBrief(ISSUE, { spec: 'Dodge debris.', qa: [] });
  await store.setSubmissionSeed(ISSUE, { slug: SLUG, files, references: [], notes: 'continue me' });
  const app = await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: stubGitHub(),
      githubToken: 'gh-token',
      submissionTokenSecret: secret,
      agentChannel: { gamesStore },
    },
  });
  return app;
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

async function session(app: FastifyInstance) {
  const init = await mcpCall(app, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  const headers = { 'mcp-session-id': String(init.headers['mcp-session-id']) };
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await mcpCall(app, 'tools/call', { name, arguments: args }, headers);
    const body = res.json() as {
      result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text: string }> };
    };
    const structured =
      body.result?.structuredContent ??
      (body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : undefined);
    return { structured: structured as Record<string, unknown>, isError: Boolean(body.result?.isError) };
  };
  const started = await call('start', { key: mintAgentToken(ISSUE, secret, { roundGeneration: 1 }) });
  const sessionKey = (started.structured as { sessionKey: string }).sessionKey;
  return { call: (name: string, args: Record<string, unknown> = {}) => call(name, { sessionKey, ...args }) };
}

async function untar(bytes: Buffer): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  for await (const entry of readTarEntries(
    (async function* () {
      yield gunzipSync(bytes);
    })(),
  )) {
    entries.set(entry.path, Buffer.from(entry.bytes).toString('utf8'));
  }
  return entries;
}

describe('get_sources and read_source_files', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('withholds a large tree behind a manifest, keeping GAME.json inline', async () => {
    app = await setup();
    const { call } = await session(app);
    const sources = await call('get_sources');
    expect(sources.isError).toBe(false);
    expect(sources.structured).toMatchObject({ available: true, origin: 'seed', truncated: true });
    expect(sources.structured.files).toEqual([SEED_FILES[0]]);
    const manifest = sources.structured.manifest as Array<{ path: string; bytes: number; lines: number }>;
    expect(manifest.map((entry) => entry.path)).toEqual(['GAME.json', 'game.ts', 'game/runtime.ts']);
    expect(manifest[1]!.bytes).toBe(Buffer.byteLength(SEED_FILES[1]!.content));
    expect(manifest[1]!.lines).toBe(SEED_FILES[1]!.content.split('\n').length);
  });

  it('serves the withheld tree as a signed .tar.gz matching its sha256', async () => {
    app = await setup();
    const { call } = await session(app);
    const archive = (await call('get_sources')).structured.archive as {
      url: string;
      method: string;
      headers: Record<string, string>;
      sha256: string;
      root: string;
    };
    expect(archive).toMatchObject({ method: 'GET', root: SLUG });
    const res = await app.inject({ method: 'GET', url: new URL(archive.url).pathname, headers: archive.headers });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(sha256Hex(res.rawPayload)).toBe(archive.sha256);
    const entries = await untar(res.rawPayload);
    expect([...entries.keys()].sort()).toEqual(SEED_FILES.map((file) => `${SLUG}/${file.path}`).sort());
    expect(entries.get(`${SLUG}/game/runtime.ts`)).toBe(SEED_FILES[2]!.content);
  });

  it('refuses the archive without its credential', async () => {
    app = await setup();
    const { call } = await session(app);
    const archive = (await call('get_sources')).structured.archive as { url: string };
    const res = await app.inject({ method: 'GET', url: new URL(archive.url).pathname });
    expect(res.statusCode).toBe(401);
  });

  it('reads chosen files and names the paths that are not in the game', async () => {
    app = await setup();
    const { call } = await session(app);
    const read = await call('read_source_files', { paths: ['game/runtime.ts', 'game/nope.ts'] });
    expect(read.isError).toBe(false);
    expect(read.structured.files).toEqual([SEED_FILES[2]]);
    expect(read.structured.rejected).toEqual([{ path: 'game/nope.ts', reason: expect.stringContaining('manifest') }]);
  });

  it('returns everything inline for full:true and for a small game', async () => {
    app = await setup();
    const full = await (await session(app)).call('get_sources', { full: true });
    expect(full.structured.files).toEqual(SEED_FILES);
    expect(full.structured.truncated).toBeUndefined();
    await app.close();

    const small = [{ path: 'game.ts', content: 'export const seed = true;' }];
    app = await setup(small);
    const inline = await (await session(app)).call('get_sources');
    expect(inline.structured.files).toEqual(small);
    expect(inline.structured.archive).toBeUndefined();
  });
});
