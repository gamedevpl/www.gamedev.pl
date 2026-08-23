import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintAgentToken } from './agent-surface/agent-token.js';
import { buildApp } from './app.js';
import type { GamesStore, SourceFile } from './delivery/games-store.js';
import { validateSourceUpload } from './delivery/games-store.js';
import type { GitHubClient } from './catalog/github-client.js';
import { InMemoryStore } from './store.js';

const ISSUE = 42;
const SECRET = 'test-secret';
const SLUG = 'comet-courier';
const PRIOR_VERSION = 'v-prior';

const priorFiles: Record<string, string> = {
  'SPEC.md': '---\ntitle: Comet Courier\n---\n',
  'game.ts': 'export {};',
  'game/render.ts': 'export function paint() {\n  drawSky();\n}\n',
  'AGENT.json': '{"policy":"capture"}',
  'GAME.json': JSON.stringify({
    engine: { modules: [] },
    howToPlay: { goal: { en: 'Survive', pl: 'Przetrwaj' }, hint: { en: 'Move', pl: 'Ruszaj się' } },
  }),
};

function agentHeaders() {
  return { authorization: `Bearer ${mintAgentToken(ISSUE, SECRET, { roundGeneration: 1 })}` };
}

function fakeGamesStore(deliveries: SourceFile[][]): GamesStore {
  const staged = new Map<string, string>();
  return {
    getManifest: async (_slug: string, version: string) =>
      version === PRIOR_VERSION ? ({ sourceFiles: Object.keys(priorFiles) } as never) : null,
    getSourceFile: async (_slug: string, version: string, path: string) =>
      version === PRIOR_VERSION ? (priorFiles[path] ?? null) : null,
    getStagedSourceFile: async (input: { path: string }) => staged.get(input.path) ?? null,
    getStagedSourceFiles: async () => [...staged].map(([path, content]) => ({ path, content })),
    putStagedSourceFile: async (input: { path: string; content: string }) => {
      staged.set(input.path, input.content);
      return {
        path: input.path,
        bytes: Buffer.byteLength(input.content),
        files: [...staged].map(([path, content]) => ({ path, bytes: Buffer.byteLength(content) })),
        totalBytes: [...staged.values()].reduce((sum, content) => sum + Buffer.byteLength(content), 0),
        maxBytes: 2 * 1024 * 1024,
        maxFiles: 200,
        updatedAt: '2026-08-20T00:00:00.000Z',
      };
    },
    clearStagedSources: async () => {
      const cleared = staged.size;
      staged.clear();
      return { cleared };
    },
    putCandidateSources: async (input: { files: SourceFile[]; mode?: 'preview' | 'publish' }) => {
      validateSourceUpload(input.files, input.mode ?? 'publish');
      deliveries.push(input.files);
      return { version: 'v-next', manifest: {} as never };
    },
    putGateResult: async () => {},
    putPreviewGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getDerivedArtifact: async () => null,
  } as unknown as GamesStore;
}

async function createApp(store: InMemoryStore, gamesStore: GamesStore): Promise<FastifyInstance> {
  await store.upsertUser({ uid: 'g:owner' });
  return await buildApp({
    store,
    sessionSecret: 'dev-session-secret-change-me',
    submissionRoutes: {
      githubClient: {} as GitHubClient,
      githubToken: 'gh-token',
      submissionTokenSecret: SECRET,
      agentChannel: { gamesStore },
    },
  });
}

describe('agent source inheritance across rounds', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('restores and overlays an unpublished sibling delivery', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(ISSUE, 'g:owner', 'Current round');
    await store.setSubmissionSlug(ISSUE, SLUG);
    await store.createSubmission(ISSUE - 1, 'g:owner', 'Prior round');
    await store.setSubmissionSlug(ISSUE - 1, SLUG);
    await store.setSubmissionPreviewVersion(ISSUE - 1, PRIOR_VERSION);
    const deliveries: SourceFile[][] = [];
    app = await createApp(store, fakeGamesStore(deliveries));
    const historyReads = vi.spyOn(store, 'listSubmissionsByOwner');

    const restored = await app.inject({ method: 'GET', url: '/api/agent/build/sources', headers: agentHeaders() });
    expect(restored.json()).toMatchObject({
      origin: 'delivery',
      delivery: { slug: SLUG, version: PRIOR_VERSION },
      files: expect.arrayContaining([{ path: 'SPEC.md', content: priorFiles['SPEC.md'] }]),
    });
    historyReads.mockClear();

    const patched = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources/stage/patch',
      headers: agentHeaders(),
      payload: {
        files: [
          { path: 'game/render.ts', old: '  drawSky();\n', new: '  drawSky();\n  drawHud();\n' },
          { path: 'game.ts', old: 'export {};', new: 'export const inherited = true;' },
        ],
      },
    });
    expect(patched.json()).toMatchObject({ accepted: true, baseFrom: 'delivery' });
    expect(historyReads).toHaveBeenCalledOnce();

    const submitted = await app.inject({
      method: 'POST',
      url: '/api/agent/build/sources',
      headers: agentHeaders(),
      payload: { slug: SLUG, fromStaged: true, kitEngineRef: 'abcdef1234567890', mode: 'preview' },
    });
    expect(submitted.statusCode).toBe(200);
    expect(deliveries[0]).toEqual(
      expect.arrayContaining([
        { path: 'SPEC.md', content: priorFiles['SPEC.md'] },
        { path: 'game.ts', content: 'export const inherited = true;' },
        { path: 'game/render.ts', content: expect.stringContaining('drawHud()') },
      ]),
    );
  });
});
