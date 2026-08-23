import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { GamesStore } from './delivery/games-store.js';
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
  // index.html is refused as an upload — howToPlay supplies markup instead.
  'GAME.json': JSON.stringify({
    engine: { modules: ['gfx', 'audio', 'editor'] },
    howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
  }),
  'EDITOR.json': EDITOR_JSON,
  'game.ts': 'import "./game/runtime.ts";',
  'game/editor-content.ts': '// stale generated module',
  'style.css': 'body{}',
  'TRACE.json': '{"samples":[]}',
  'PLAYTEST.json': '{"expectProgress":["round-start"]}',
  'CAPTURE.json': '{"script":[]}',
  'ACCEPTANCE.json': '{"objective":"x","achieved":[]}',
};

function stubGamesStore(options: { hasEditor?: boolean; sealed?: boolean } = {}) {
  const hasEditor = options.hasEditor ?? true;
  const sealed = options.sealed ?? true;
  const stored: Array<{
    slug: string;
    files: Array<{ path: string; content: string }>;
    origin?: string;
    engineRef?: string;
  }> = [];
  const gamesStore = {
    putCandidateSources: async (input: {
      slug: string;
      files: Array<{ path: string; content: string }>;
      origin?: string;
      engineRef?: string;
    }) => {
      stored.push(input);
      const { validateSourceUpload } = await import('./delivery/games-store.js');
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
          sourceFiles: Object.keys(VERSION_SOURCES).filter(
            (path) =>
              (hasEditor || path !== 'EDITOR.json') && (sealed || (path !== 'TRACE.json' && path !== 'PLAYTEST.json')),
          ),
        };
      }
      const candidate = stored.length > 0 ? stored[stored.length - 1] : null;
      if (!candidate || version !== 'v2-editor') return null;
      return {
        slug: candidate.slug,
        version,
        createdAt: 'now',
        issueNumber: sourceJob,
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

/** Seeded through the allocator so a published edit gets a genuinely new job id. */
let sourceJob = 0;

async function seedOwnedGame(store: InMemoryStore, uid: string) {
  await store.upsertUser({ uid });
  sourceJob = await store.allocateJobId();
  await store.createSubmission(sourceJob, uid, 'Garden Gather');
  await store.setSubmissionSlug(sourceJob, 'garden-gather');
  await store.setSubmissionDeliveredVersion(sourceJob, 'v1');
}

/** Mid-round: a preview landed, nothing delivered yet. */
async function seedPreviewOnlyGame(store: InMemoryStore, uid: string) {
  await store.upsertUser({ uid });
  sourceJob = await store.allocateJobId();
  await store.createSubmission(sourceJob, uid, 'Garden Gather');
  await store.setSubmissionSlug(sourceJob, 'garden-gather');
  await store.setSubmissionPreviewVersion(sourceJob, 'v1');
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

  async function createApp(overrides: { hasEditor?: boolean; sealed?: boolean; gateRuns?: string[] } = {}) {
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

  it('is editable off a mode=preview build mid-round, before anything is delivered', async () => {
    const { app } = await createApp();
    await seedPreviewOnlyGame(store, 'g:alice');
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('v1');
  });

  it('prefers the newer preview build over an older delivered one', async () => {
    const { app, stored } = await createApp();
    // seedOwnedGame's beforeEach already delivered v1; layer a newer preview on top
    // by publishing a draft (which lands as 'v2-editor' per stubGamesStore), then
    // point previewVersion at it without ever delivering it.
    await store.setSubmissionPreviewVersion(sourceJob, 'v1');
    const draft = await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: {
        content: { gardens: [{ properties: { name: 'Mine' }, rows: ['########', '#..@..*#', '########'] }] },
      },
    });
    expect(draft.statusCode).toBe(200);
    const publish = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    expect(publish.statusCode).toBe(200);
    expect(stored).toHaveLength(1);
    await store.setSubmissionPreviewVersion(sourceJob, 'v2-editor');

    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('v2-editor');
  });

  it('refuses quietly (not a 500) when a still-iterating preview build has no valid EDITOR.json yet', async () => {
    const { gamesStore } = stubGamesStore();
    const brokenGamesStore = {
      ...gamesStore,
      getSourceFile: async (slug: string, version: string, path: string) => {
        if (version === 'v1' && path === 'EDITOR.json') return '{not valid json';
        return gamesStore.getSourceFile(slug, version, path);
      },
    } as unknown as GamesStore;
    app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret: 'token-secret',
        agentChannel: { gamesStore: brokenGamesStore, onSourcesDelivered: () => ({ buildId: 'build-1' }) },
      },
    });
    await seedPreviewOnlyGame(store, 'g:alice');

    const response = await app.inject({
      method: 'GET',
      url: '/api/me/games/garden-gather/editor',
      headers: authHeaders('g:alice'),
    });
    // Mid-iteration, not gate-checked yet — a 404 ("nothing to edit"), not a 500
    // ("platform bug"), because it may well not be one.
    expect(response.statusCode).toBe(404);
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

    // The edit becomes its *own* reviewable job — `published` is terminal, so
    // hanging the candidate off the original would leave its gate verdict where
    // neither the reconciler nor the operator queue looks.
    const jobId = publish.json().jobId as number;
    expect(jobId).not.toBe(sourceJob);
    const created = await store.getSubmission(jobId);
    expect(created?.slug).toBe('garden-gather');
    expect(created?.deliveredVersion).toBe('v2-editor');
    expect(created?.state).toBe('submitted');
    // ...and the original job is left alone, still terminal.
    expect((await store.getSubmission(sourceJob))?.deliveredVersion).toBe('v1');
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

  it('refuses to publish while an agent is actively building the round', async () => {
    const { app } = await createApp();
    await store.recordDispatch(sourceJob, { backend: 'claude', ref: 'workspace-1' });
    await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: {
        content: { gardens: [{ properties: { name: 'Mine' }, rows: ['########', '#..@..*#', '########'] }] },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    // A fork here would strand the agent's next delivery behind a newer job.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('agent_round');
  });

  it('refuses to publish off an unsealed preview instead of throwing once the copy is underway', async () => {
    const { app } = await createApp({ sealed: false });
    await seedPreviewOnlyGame(store, 'g:alice');
    await app.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: {
        content: { gardens: [{ properties: { name: 'Mine' }, rows: ['########', '#..@..*#', '########'] }] },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/publish',
      headers: authHeaders('g:alice'),
    });
    // A preview may legitimately lack both seals — publish's default mode requires them.
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('not_sealed');
  });

  describe('the entities widget', () => {
    const ENTITIES_EDITOR_JSON = JSON.stringify({
      version: 1,
      content: {
        cards: {
          widget: 'collection',
          label: { en: 'Cards', pl: 'Karty' },
          itemLabel: { en: 'Card', pl: 'Karta' },
          min: 2,
          max: 4,
          item: {
            widget: 'entities',
            properties: { cost: { type: 'int', min: 0, max: 3 } },
            constraints: [{ uniqueBy: 'cost' }],
          },
          defaults: [{ properties: { cost: 0 } }, { properties: { cost: 1 } }],
        },
      },
    });

    async function createEntitiesApp(gateRuns: string[] = []) {
      const { gamesStore, stored } = stubGamesStore();
      const withEntities = {
        ...gamesStore,
        getSourceFile: async (slug: string, version: string, path: string) =>
          path === 'EDITOR.json' && version === 'v1'
            ? ENTITIES_EDITOR_JSON
            : ((await (
                gamesStore as unknown as { getSourceFile: (s: string, v: string, p: string) => Promise<string | null> }
              ).getSourceFile(slug, version, path)) ?? null),
      } as unknown as GamesStore;
      app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          submissionTokenSecret: 'token-secret',
          agentChannel: {
            gamesStore: withEntities,
            onSourcesDelivered: ({ version }: { version: string }) => {
              gateRuns.push(version);
              return { buildId: 'build-1' };
            },
          },
        },
      });
      return { app, stored };
    }

    it('refuses a draft with a duplicate uniqueBy value', async () => {
      const { app } = await createEntitiesApp();
      const response = await app.inject({
        method: 'PUT',
        url: '/api/me/games/garden-gather/editor/draft',
        headers: authHeaders('g:alice'),
        payload: { content: { cards: [{ properties: { cost: 1 } }, { properties: { cost: 1 } }] } },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().problems.some((p: string) => p.includes('duplicates'))).toBe(true);
    });

    it('drafts, publishes, and gates an entities collection — no board, no rows in L1', async () => {
      const gateRuns: string[] = [];
      const { app, stored } = await createEntitiesApp(gateRuns);
      const content = { cards: [{ properties: { cost: 2 } }, { properties: { cost: 3 } }] };
      const draft = await app.inject({
        method: 'PUT',
        url: '/api/me/games/garden-gather/editor/draft',
        headers: authHeaders('g:alice'),
        payload: { content },
      });
      expect(draft.statusCode).toBe(200);

      const publish = await app.inject({
        method: 'POST',
        url: '/api/me/games/garden-gather/editor/publish',
        headers: authHeaders('g:alice'),
      });
      expect(publish.statusCode).toBe(200);
      expect(stored).toHaveLength(1);

      const editorJson = stored[0].files.find((file) => file.path === 'EDITOR.json')!;
      const publishedDefaults = JSON.parse(editorJson.content).content.cards.defaults;
      expect(publishedDefaults).toEqual([{ properties: { cost: 2 } }, { properties: { cost: 3 } }]);

      const generated = stored[0].files.find((file) => file.path === 'game/editor-content.ts')!;
      expect(generated.content).toContain('export const DEFAULT_CONTENT');
      expect(generated.content).not.toContain('rows');

      expect(gateRuns).toEqual(['v2-editor']);
    });
  });
});

/*
 * The assist route. Its own guarantees are the ones tested here: it is off
 * unless the deploy flag says so, it never writes (the returned document still
 * goes through the draft write), moderation and quota come before the paid
 * call, and a non-params lane is reported honestly rather than as a silent
 * no-op.
 */
describe('editor assist route', () => {
  let store: InMemoryStore;
  let app: FastifyInstance | null = null;

  const PARAMS_EDITOR_JSON = JSON.stringify({
    version: 1,
    params: {
      dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size', pl: 'Wielkość psa' } },
    },
    content: JSON.parse(EDITOR_JSON).content,
  });

  beforeEach(async () => {
    store = new InMemoryStore();
    await seedOwnedGame(store, 'g:alice');
    delete process.env.EDITOR_ASSIST;
    if (app) {
      await app.close();
      app = null;
    }
  });

  async function createAssistApp(assistant?: {
    assist: () => Promise<{ lane: string; patches?: Array<{ key: string; value: unknown }>; tokens?: unknown }>;
  }) {
    const { gamesStore } = stubGamesStore();
    // Same stub version, but its EDITOR.json declares a tunable.
    const withParams = {
      ...gamesStore,
      getSourceFile: async (slug: string, version: string, path: string) =>
        path === 'EDITOR.json' && version === 'v1'
          ? PARAMS_EDITOR_JSON
          : ((await (
              gamesStore as unknown as { getSourceFile: (s: string, v: string, p: string) => Promise<string | null> }
            ).getSourceFile(slug, version, path)) ?? null),
    } as unknown as GamesStore;
    app = await buildApp({
      store,
      sessionSecret,
      ...(assistant ? { editorAssistant: assistant as never } : {}),
      submissionRoutes: {
        submissionTokenSecret: 'token-secret',
        agentChannel: { gamesStore: withParams, onSourcesDelivered: () => ({ buildId: 'b' }) },
      },
    });
    return app;
  }

  const call = (instance: FastifyInstance, utterance: string) =>
    instance.inject({
      method: 'POST',
      url: '/api/me/games/garden-gather/editor/assist',
      headers: authHeaders('g:alice'),
      payload: {
        utterance,
        content: { params: { dogScale: 1 }, gardens: JSON.parse(PARAMS_EDITOR_JSON).content.gardens.defaults },
      },
    });

  it('503s while the deploy flag is off, without calling the model', async () => {
    let called = false;
    const instance = await createAssistApp({
      assist: async () => {
        called = true;
        return { lane: 'params' };
      },
    });
    const response = await call(instance, 'make the dog bigger');
    expect(response.statusCode).toBe(503);
    expect(called).toBe(false);
  });

  it('applies a params patch and returns a document the draft write accepts', async () => {
    process.env.EDITOR_ASSIST = 'true';
    const instance = await createAssistApp({
      assist: async () => ({
        lane: 'params',
        patches: [{ key: 'dogScale', value: 1.4 }],
        tokens: { input: 900, output: 40 },
      }),
    });
    const response = await call(instance, 'the dog should be slightly bigger');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.lane).toBe('params');
    expect(body.patches).toEqual([{ key: 'dogScale', value: 1.4 }]);

    // The route wrote nothing; the ordinary draft path still has to accept it.
    const saved = await instance.inject({
      method: 'PUT',
      url: '/api/me/games/garden-gather/editor/draft',
      headers: authHeaders('g:alice'),
      payload: { content: body.content },
    });
    expect(saved.statusCode).toBe(200);

    // And the spend landed on the game's own job, beside gate runs and seeds.
    const job = await store.getSubmission(sourceJob);
    expect(job?.costs?.some((entry) => entry.kind === 'assist')).toBe(true);
  });

  it('reports a code-lane hand-off instead of inventing a value', async () => {
    process.env.EDITOR_ASSIST = 'true';
    const instance = await createAssistApp({
      assist: async () => ({ lane: 'code' }),
    });
    const response = await call(instance, 'make the dog bark when I click it');
    expect(response.statusCode).toBe(200);
    expect(response.json().lane).toBe('code');
  });

  it('drops an undeclared key the model proposed, and says so as a hand-off', async () => {
    process.env.EDITOR_ASSIST = 'true';
    const instance = await createAssistApp({
      assist: async () => ({ lane: 'params', patches: [{ key: 'catScale', value: 2 }] }),
    });
    const response = await call(instance, 'make the cat bigger');
    expect(response.json().lane).toBe('code');
    expect(response.json().patches).toBeUndefined();
  });

  it('spends the daily quota and refuses past it', async () => {
    process.env.EDITOR_ASSIST = 'true';
    // Kept well under the route's own 20/min rate limit, which is a different
    // ceiling for a different reason (burst vs. daily spend).
    process.env.DAILY_ASSIST_QUOTA = '3';
    try {
      const instance = await createAssistApp({ assist: async () => ({ lane: 'code' }) });
      for (let i = 0; i < 3; i += 1) {
        expect((await call(instance, `tweak ${i}`)).statusCode).toBe(200);
      }
      expect((await call(instance, 'one too many')).statusCode).toBe(429);
    } finally {
      delete process.env.DAILY_ASSIST_QUOTA;
    }
  });
});
