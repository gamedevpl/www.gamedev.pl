import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { GamesStore } from './games-store.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

const EDITOR_JSON = JSON.stringify({
  version: 1,
  content: {
    gardens: {
      widget: 'collection',
      label: { en: 'Gardens', pl: 'Ogrody' },
      itemLabel: { en: 'Garden', pl: 'Ogród' },
      min: 1,
      max: 4,
      item: {
        widget: 'tilemap',
        grid: { minCols: 6, maxCols: 12, minRows: 3, maxRows: 6 },
        tiles: [
          { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
          { key: 'hedge', char: '#', label: { en: 'Hedge', pl: 'Żywopłot' } },
          { key: 'seed', char: '*', label: { en: 'Seed', pl: 'Nasiono' } },
          { key: 'start', char: '@', label: { en: 'Start', pl: 'Start' } },
        ],
        properties: { name: { type: 'text', max: 24 } },
        constraints: [{ tile: 'start', exactly: 1 }],
      },
      defaults: [{ properties: { name: 'First' }, rows: ['########', '#@*....#', '########'] }],
    },
  },
});

const VERSION_SOURCES: Record<string, string> = {
  'SPEC.md': '---\ntitle: Test\n---\nbody',
  'GAME.json': '{"engine":{"modules":["gfx","audio","editor"]}}',
  'EDITOR.json': EDITOR_JSON,
  'game.ts': 'import "./game/runtime.ts";',
  'game/editor-content.ts': '// stale generated module',
  'index.html': '<canvas id="game"></canvas>',
  'style.css': 'body{}',
  'TRACE.json': '{"samples":[]}',
  'PLAYTEST.json': '{"expectProgress":["round-start"]}',
  'CAPTURE.json': '{"script":[]}',
  'ACCEPTANCE.json': '{"objective":"x","achieved":[]}',
};

function stubGamesStore(options: { hasEditor?: boolean } = {}) {
  const hasEditor = options.hasEditor ?? true;
  const stored: Array<{ slug: string; files: Array<{ path: string; content: string }>; origin?: string; engineRef?: string }> =
    [];
  const gamesStore = {
    putCandidateSources: async (input: {
      slug: string;
      files: Array<{ path: string; content: string }>;
      origin?: string;
      engineRef?: string;
    }) => {
      stored.push(input);
      const { validateSourceUpload } = await import('./games-store.js');
      validateSourceUpload(input.files);
      return { version: 'v2-editor', manifest: {} as never };
    },
    getManifest: async (_slug: string, version: string) => {
      if (version === 'v1') {
        return {
          slug: 'garden-gather',
          version: 'v1',
          createdAt: 'now',
          issueNumber: 1_000_001,
          engineRef: 'abc1234',
          sourceFiles: Object.keys(VERSION_SOURCES).filter((path) => hasEditor || path !== 'EDITOR.json'),
        };
      }
      const candidate = stored.length > 0 ? stored[stored.length - 1] : null;
      if (!candidate || version !== 'v2-editor') return null;
      return {
        slug: candidate.slug,
        version,
        createdAt: 'now',
        issueNumber: 1_000_001,
        engineRef: candidate.engineRef,
        origin: 'editor',
        sourceFiles: candidate.files.map((file) => file.path),
      };
    },
    getSourceFile: async (_slug: string, version: string, path: string) => {
      if (version === 'v1') {
        if (!hasEditor && path === 'EDITOR.json') return null;
        return VERSION_SOURCES[path] ?? null;
      }
      const candidate = stored.length > 0 ? stored[stored.length - 1] : null;
      if (!candidate || version !== 'v2-editor') return null;
      return candidate.files.find((file) => file.path === path)?.content ?? null;
    },
    putGateResult: async () => {},
    putDerivedArtifact: async () => {},
    getDerivedArtifact: async () => null,
    getKitRegistry: async () => null,
  } as unknown as GamesStore;
  return { gamesStore, stored };
}

async function seedOwnedGame(store: InMemoryStore, uid: string) {
  await store.upsertUser({ uid });
  await store.createSubmission(1_000_001, uid, 'Garden Gather');
  await store.setSubmissionSlug(1_000_001, 'garden-gather');
  await store.setSubmissionDeliveredVersion(1_000_001, 'v1');
}

describe('editor draft routes', () => {
  let store: InMemoryStore;
  let app: FastifyInstance | null = null;

  beforeEach(async () => {
    store = new InMemoryStore();
    await seedOwnedGame(store, 'g:alice');
    await store.upsertUser({ uid: 'g:bob' });
    if (app) {
      await app.close();
      app = null;
    }
  });

  async function createApp(overrides: { hasEditor?: boolean; gateRuns?: string[] } = {}) {
    const { gamesStore, stored } = stubGamesStore(overrides);
    app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret: 'token-secret',
        agentChannel: {
          gamesStore,
          onSourcesDelivered: ({ version }: { version: string }) => {
            overrides.gateRuns?.push(version);
            return { buildId: 'build-1' };
          },
        },
      },
    });
    return { app, stored };
  }

  it('requires a session on every route', async () => {
    const { app } = await createApp();
    for (const [method, url] of [
      ['GET', '/api/me/games/garden-gather/editor'],
      ['PUT', '/api/me/games/garden-gather/editor/draft'],
      ['DELETE', '/api/me/games/garden-gather/editor/draft'],
      ['POST', '/api/me/games/garden-gather/editor/publish'],
    ] as const) {
      const response = await app.inject({ method, url, payload: { content: {} } });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("404s for someone else's game — a slug is public, its ownership is not", async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:bob'),
    });
    expect(response.statusCode).toBe(404);
  });

  it('404s for an owned game whose version ships no EDITOR.json — the no-editor CUJ', async () => {
    const { app } = await createApp({ hasEditor: false });
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(404);
    // And a draft write is refused the same way — no side door into an
    // uneditable game.
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content: { gardens: [] } },
    });
    expect(put.statusCode).toBe(404);
  });

  it('serves the definition, the shipped defaults, and no draft initially', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe('v1');
    expect(body.definition.content.gardens.item.tiles).toHaveLength(4);
    expect(body.content.gardens).toHaveLength(1);
    expect(body.draft).toBeNull();
  });

  it('round-trips a valid draft and bumps the revision', async () => {
    const { app } = await createApp();
    const content = { gardens: [{ properties: { name: 'Mine' }, rows: ['########', '#..@..*#', '########'] }] };
    const put = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().revision).toBe(1);

    const get = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    expect(get.json().draft.content).toEqual(content);
    expect(get.json().draft.revision).toBe(1);
  });

  it('refuses a draft that breaks the declared schema, naming the problems', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      // Two starts — violates the exactly-one constraint.
      payload: { content: { gardens: [{ properties: { name: 'Bad' }, rows: ['########', '#@..@.*#', '########'] }] } },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().problems.some((p: string) => p.includes('exactly 1 "start"'))).toBe(true);
  });

  it('409s a stale baseRevision so a second tab warns instead of clobbering', async () => {
    const { app } = await createApp();
    const rows = ['########', '#..@..*#', '########'];
    const first = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content: { gardens: [{ properties: { name: 'One' }, rows }] }, baseRevision: 0 },
    });
    expect(first.statusCode).toBe(200);
    const stale = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content: { gardens: [{ properties: { name: 'Two' }, rows }] }, baseRevision: 0 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().revision).toBe(1);
  });

  it('publishes the draft as a content-only candidate: defaults swapped, module regenerated, gate started', async () => {
    const gateRuns: string[] = [];
    const { app, stored } = await createApp({ gateRuns });
    const content = { gardens: [{ properties: { name: 'Published' }, rows: ['########', '#.@...*#', '########'] }] };
    await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content },
    });
    const publish = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().version).toBe('v2-editor');

    expect(stored).toHaveLength(1);
    const candidate = stored[0];
    expect(candidate.origin).toBe('editor');
    expect(candidate.engineRef).toBe('abc1234');
    const editorJson = candidate.files.find((file) => file.path === 'EDITOR.json')!;
    expect(JSON.parse(editorJson.content).content.gardens.defaults[0].properties.name).toBe('Published');
    const generated = candidate.files.find((file) => file.path === 'game/editor-content.ts')!;
    expect(generated.content).toContain('"name": "Published"');
    expect(generated.content).toContain('export const DEFAULT_CONTENT');

    // The submission now points at the candidate, and the gate was asked to run.
    expect((await store.getSubmission(1_000_001))?.deliveredVersion).toBe('v2-editor');
    expect(gateRuns).toEqual(['v2-editor']);

    // A second publish inside the cooldown is debounced, not silently queued.
    const again = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    expect(again.statusCode).toBe(429);
  });

  it('409s a publish with no draft', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(409);
  });
});
