import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRemixRoutes, MAX_REMIX_ID_LENGTH, REMIX_TTL_MS } from './remix.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { EditorAssistant } from './editor-assist.js';
import { openProposal } from '../community/proposals.js';

/*
 * The remix surface's promises, tested at the route: it is signed-in only for
 * now, a remix belongs to whoever started it, nothing a browser sends is ever
 * compiled, a code edit is only visible once it builds, and a share link carries
 * declared values and never generated code.
 */

const EDITOR_JSON = JSON.stringify({
  version: 1,
  params: {
    dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size', pl: 'Pies' } },
    tagline: { type: 'text', max: 40, default: 'go!', label: { en: 'Tagline', pl: 'Hasło' } },
  },
  // A collection too, so the start response's `content` half — what the remix
  // painter renders — is exercised against a full declaration, not a
  // tunables-only one.
  content: {
    maps: {
      widget: 'collection',
      label: { en: 'Maps', pl: 'Mapy' },
      itemLabel: { en: 'Map', pl: 'Mapa' },
      min: 1,
      max: 3,
      item: {
        widget: 'tilemap',
        grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
        tiles: [
          { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
          { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
        ],
        properties: {},
        constraints: [],
      },
      defaults: [{ properties: {}, rows: ['...', '.#.', '...'] }],
    },
  },
});

const SOURCES: Record<string, string> = {
  'EDITOR.json': EDITOR_JSON,
  'GAME.json': '{"engine":{"modules":[]}}',
  'SPEC.md': '---\ntitle: Dog Dash\n---\n',
  'index.html': '<canvas id="game"></canvas>',
  'style.css': 'body{}',
  'game.ts': "import './game/runtime.ts';\n",
  'game/runtime.ts': '/** Start it. */\nexport function startGame() {\n  return 0.16;\n}\n',
};

function stubGamesStore(captures?: {
  puts?: Array<{ slug: string; files: Array<{ path: string; content: string }>; manifest: unknown }>;
  derived?: Array<{ slug: string; version: string; name: string }>;
}): GamesStore {
  return {
    getManifest: async () => ({
      slug: 'dog-dash',
      version: 'v1',
      createdAt: 'now',
      jobId: 1,
      engineRef: 'abc123',
      sourceFiles: Object.keys(SOURCES),
    }),
    getSourceFile: async (_slug: string, _version: string, path: string) => SOURCES[path] ?? null,
    putCandidateSources: async (input) => {
      const version = 'v-saved';
      const manifest = {
        slug: input.slug,
        version,
        createdAt: 'now',
        jobId: input.jobId,
        engineRef: input.engineRef,
        deliveryMode: input.mode ?? 'publish',
        origin: input.origin,
        forkedFrom: input.forkedFrom,
        requireCompiledEditor: input.requireCompiledEditor,
        sourceFiles: input.files.map((file) => file.path),
      };
      captures?.puts?.push({ slug: input.slug, files: input.files, manifest });
      return { version, manifest };
    },
    putDerivedArtifact: async (slug, version, name) => {
      captures?.derived?.push({ slug, version, name });
    },
  } as unknown as GamesStore;
}

/** Records what the assembler was asked to build, so overrides can be asserted. */
function stubGitHubClient(
  seen: Array<Record<string, string> | undefined>,
  sourceMapCalls: string[] = [],
): GitHubClient {
  return {
    getGameFile: async (_ref: string, slug: string, path: string) =>
      slug === 'dog-dash' || slug === 'repo-game' || slug === 'catalog-dash' ? (SOURCES[path] ?? null) : null,
    // The bundler's walk, stubbed: the game's own TypeScript, keyed relatively.
    getGameSourceMap: async (_ref: string, slug: string) => {
      sourceMapCalls.push(slug);
      // `repo-game` deliberately has none: a game that declares itself but whose
      // code will not assemble is the case the deep lane has to decline.
      if (slug !== 'dog-dash') return null;
      return { 'game.ts': SOURCES['game.ts'], 'game/runtime.ts': SOURCES['game/runtime.ts'] };
    },
    getGameDeliverySources: async (_ref: string, slug: string) => {
      if (slug === 'dog-dash') return { ...SOURCES };
      // Catalog-only fixture used by the eras tests — full delivery set, no store publication.
      if (slug === 'catalog-dash') return { ...SOURCES };
      return null;
    },
    getRefSha: async () => 'refsha1',
    // No kit declaration on this ref. The lane must still edit, and the
    // type-check gate must stand down rather than failing every candidate —
    // a fixture without the engine's declaration is not a broken game.
    getGameKitDeclaration: async () => null,
    getGameSources: async (_ref: string, slug: string, overrides?: Record<string, string>) => {
      // Like the real client: a slug with no game directory on the ref is null.
      if (slug !== 'dog-dash' && slug !== 'catalog-dash') return null;
      seen.push(overrides);
      const runtime = overrides?.['game/runtime.ts'] ?? SOURCES['game/runtime.ts'];
      if (runtime.includes('SYNTAX ERROR')) return null;
      return { indexHtml: SOURCES['index.html'], gameJs: `void 0;${runtime}`, styleCss: 'body{}', title: 'Dog Dash' };
    },
  } as unknown as GitHubClient;
}

async function buildTestApp(
  overrides: {
    assistant?: EditorAssistant;
    codeLane?: unknown;
    isAbandoned?: () => boolean;
    now?: () => number;
    gamesStore?: GamesStore;
    submissionTokenSecret?: string;
    resolveProposalBase?: (slug: string) => Promise<{
      base: { kind: 'store'; version: string } | { kind: 'repo'; snapshotId: string; sha: string };
      files: Array<{ path: string; content: string }>;
    } | null>;
    onSourcesDelivered?: (input: { jobId: number; slug: string; version: string }) => void;
  } = {},
) {
  const store = new InMemoryStore();
  await store.upsertUser({ uid: 'g:alice' });
  await store.setPublication({
    slug: 'dog-dash',
    state: 'published',
    currentVersion: 'v1',
    publishedAt: new Date(0).toISOString(),
  });
  const seen: Array<Record<string, string> | undefined> = [];
  // Same router ceiling as buildApp: a remix id is longer than Fastify's
  // 100-character default, and a harness that forgot it would pass while
  // production answered 414.
  const app = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
  app.decorateRequest('user', null);
  // Stands in for the auth plugin: `x-test-uid` becomes the session, absent
  // means signed out. Enough to exercise the gate without minting real cookies.
  app.addHook('onRequest', async (request) => {
    const uid = request.headers['x-test-uid'];
    (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
  });
  await registerRemixRoutes(app, {
    store,
    openProposal,
    gamesStore: overrides.gamesStore ?? stubGamesStore(),
    githubClient: stubGitHubClient(seen),
    publishedRef: 'main',
    submissionTokenSecret: overrides.submissionTokenSecret ?? 'test-submission-secret',
    ...(overrides.assistant ? { assistant: overrides.assistant } : {}),
    ...(overrides.codeLane ? { codeLane: overrides.codeLane as never } : {}),
    ...(overrides.isAbandoned ? { isAbandoned: overrides.isAbandoned } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
    ...(overrides.resolveProposalBase ? { resolveProposalBase: overrides.resolveProposalBase } : {}),
    ...(overrides.onSourcesDelivered ? { onSourcesDelivered: overrides.onSourcesDelivered } : {}),
  });
  await app.ready();
  return { app, seen, store };
}

const alice = { 'x-test-uid': 'g:alice' };

describe('remix routes', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  it('refuses every route without a session — remix is signed-in only for now', async () => {
    const built = await buildTestApp();
    app = built.app;
    const start = await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix' });
    expect(start.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/remixes/whatever' })).statusCode).toBe(401);
    for (const lane of ['assist', 'code', 'share', 'save']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/remixes/whatever/${lane}`,
        payload: { utterance: 'bigger dog' },
      });
      // 401 before 404: a signed-out caller is told to sign in, not that the
      // remix does not exist.
      expect(response.statusCode, lane).toBe(401);
    }
  });

  it("404s another player's remix — an id is not a bearer token", async () => {
    const built = await buildTestApp({
      assistant: { assist: async () => ({ lane: 'params' }) } as EditorAssistant,
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const stolen = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: { 'x-test-uid': 'g:mallory' },
      payload: { utterance: 'bigger dog' },
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('starts a remix for a signed-in player and hands back the declared sliders', async () => {
    const built = await buildTestApp();
    app = built.app;
    const response = await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.remixId).toBeTruthy();
    expect(body.params.dogScale.max).toBe(3);
    expect(body.values).toEqual({ dogScale: 1, tagline: 'go!' });
    // The painter's half of the declaration rides along, defaults included —
    // painted content then never comes back to the server, so this response is
    // the painter's entire diet.
    expect(body.content.maps.item.tiles.map((tile: { key: string }) => tile.key)).toEqual(['path', 'wall']);
    expect(body.content.maps.defaults).toEqual([{ properties: {}, rows: ['...', '.#.', '...'] }]);
  });

  it('404s an unknown game and an expired remix id', async () => {
    const built = await buildTestApp();
    app = built.app;
    expect((await app.inject({ method: 'POST', url: '/api/games/nope/remix', headers: alice })).statusCode).toBe(404);
    const stale = await app.inject({
      method: 'POST',
      url: '/api/remixes/00000000-0000-4000-8000-000000000000/assist',
      headers: alice,
      payload: { utterance: 'bigger dog' },
    });
    expect(stale.statusCode).toBe(404);
  });

  it('applies a tuning request against declared params only', async () => {
    const built = await buildTestApp({
      assistant: {
        assist: async () => ({ lane: 'params', patches: [{ key: 'dogScale', value: 1.4 }] }),
      } as EditorAssistant,
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'the dog should be bigger', params: { dogScale: 1, tagline: 'go!' } },
    });
    expect(response.json()).toMatchObject({ lane: 'params', patches: [{ key: 'dogScale', value: 1.4 }] });
  });

  it('hands the assist lane prior turns on a follow-up', async () => {
    const seen: Array<Array<{ utterance: string; summary?: string }> | undefined> = [];
    const built = await buildTestApp({
      assistant: {
        assist: async (request) => {
          seen.push(request.history);
          return {
            lane: 'params',
            patches: [{ key: 'dogScale', value: 1.4 }],
            summary: { en: 'Made the dog bigger.', pl: 'Pies większy.' },
          };
        },
      } as EditorAssistant,
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'bigger dog', params: { dogScale: 1, tagline: 'go!' } },
    });
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'again', params: { dogScale: 1.4, tagline: 'go!' } },
    });
    expect(seen[0]).toEqual([]);
    expect(seen[1]).toEqual([{ utterance: 'bigger dog', summary: 'Made the dog bigger.' }]);
  });

  it('rebuilds a whole document for a code edit, and only after it builds', async () => {
    const codeLane = {
      run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
        // The lane's own contract: it only returns ok after the builder agreed.
        const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
        await build(good);
        return {
          ok: true,
          overrides: good,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
        };
      },
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'make it twice as fast' },
    });
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.html).toContain('return 0.08;');
    // A whole document, assembled by the real assembler — CSP included.
    expect(body.html).toContain('Content-Security-Policy');
    // The override reached the assembler; the base sources came along with it.
    const last = built.seen.at(-1)!;
    expect(last['game/runtime.ts']).toContain('return 0.08;');
    expect(last['index.html']).toBe(SOURCES['index.html']);
  });

  it('resumes a remix by id, including the rebuilt document after a code edit', async () => {
    const codeLane = {
      run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
        const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
        await build(good);
        return {
          ok: true,
          overrides: good,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
        };
      },
    };
    const built = await buildTestApp({
      codeLane,
      assistant: {
        assist: async () => ({
          lane: 'params',
          patches: [{ key: 'dogScale', value: 1.4 }],
          summary: { en: 'Bigger dog.', pl: 'Większy pies.' },
        }),
      } as EditorAssistant,
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'bigger dog', params: { dogScale: 1, tagline: 'go!' } },
    });
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'make it twice as fast' },
    });
    const resumed = await app.inject({ method: 'GET', url: `/api/remixes/${remixId}`, headers: alice });
    expect(resumed.statusCode).toBe(200);
    const body = resumed.json();
    expect(body.remixId).toBe(remixId);
    expect(body.html).toContain('return 0.08;');
    expect(body.undoable).toBe(true);
    expect(body.turns.at(-1).utterance).toBe('make it twice as fast');
    const fresh = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const empty = await app.inject({ method: 'GET', url: `/api/remixes/${fresh.remixId}`, headers: alice });
    expect(empty.json().html).toBeNull();
    expect(empty.json().undoable).toBe(false);
    expect(empty.json().rehydrated).toBeUndefined();
    const other = await buildTestApp();
    try {
      const hopped = await other.app.inject({ method: 'GET', url: `/api/remixes/${remixId}`, headers: alice });
      expect(hopped.statusCode).toBe(200);
      expect(hopped.json().rehydrated).toBe(true);
      expect(hopped.json().html).toBeNull();
      expect(hopped.json().undoable).toBe(false);
    } finally {
      await other.app.close();
    }
  });

  it('discards an abandoned code edit rather than letting it land later', async () => {
    // The client aborts at its own timeout and tells the player their game came
    // back untouched. The rebuild finishes anyway; what must not happen is that
    // edit quietly becoming the base for the next one.
    const sourcesSeen: Array<Record<string, string>> = [];
    const codeLane = {
      run: async (
        request: { sources: Record<string, string> },
        build: (o: Record<string, string>) => Promise<{ ok: boolean }>,
      ) => {
        sourcesSeen.push(request.sources);
        const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
        await build(good);
        return {
          ok: true,
          overrides: good,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
        };
      },
    };
    const built = await buildTestApp({ codeLane, isAbandoned: () => true });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();

    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'make it faster' },
    });

    // The next edit must see the ORIGINAL source, not the abandoned one.
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'again' },
    });
    expect(sourcesSeen).toHaveLength(2);
    expect(sourcesSeen[1]['game/runtime.ts']).toContain('return 0.16;');
  });

  it('refuses a second rebuild while one is in flight', async () => {
    let release: (() => void) | null = null;
    const codeLane = {
      run: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { ok: false, reason: 'did_not_compile', tokens: { input: 1, output: 1 } };
      },
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();

    const first = app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'one' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'two' },
    });
    // A double-tap or a post-timeout retry is told to wait, not charged again.
    expect(second.statusCode).toBe(409);
    release?.();
    await first;
  });

  it('puts the game back when an edit that compiled turns out to be broken', async () => {
    // The lane verifies that a rebuild assembles, not that it plays: a model can
    // rewrite a render function into valid TypeScript that draws nothing. One
    // step back is the only safety net there is, and it has to move the session
    // too — undoing the document alone would leave the next edit building on the
    // broken source.
    const codeLane = {
      run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
        const broken = { 'game/runtime.ts': 'export function startGame() {\n  return 0.99;\n}\n' };
        await build(broken);
        return {
          ok: true,
          overrides: broken,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
        };
      },
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();

    const edit = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'draw carrots' },
    });
    expect(edit.json().html).toContain('return 0.99;');

    const undone = await app.inject({ method: 'POST', url: `/api/remixes/${remixId}/undo`, headers: alice });
    expect(undone.statusCode).toBe(200);
    // The published game, not the edit.
    expect(undone.json().html).toContain('return 0.16;');
    expect(undone.json().undoable).toBe(false);

    // And the session went back with it: the next rebuild starts from the game,
    // not from the change the player just rejected.
    expect(built.seen.at(-1)?.['game/runtime.ts']).not.toContain('return 0.99;');

    // Nothing left to undo.
    const again = await app.inject({ method: 'POST', url: `/api/remixes/${remixId}/undo`, headers: alice });
    expect(again.statusCode).toBe(409);
    expect(again.json().reason).toBe('nothing_to_undo');
  });

  it('carries the lane trace into the answer only under the debug flag', async () => {
    // Temporary and deliberately loud: it carries the utterance, so it must be a
    // deploy-time decision rather than something a request can ask for.
    const codeLane = {
      run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
        const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
        await build(good);
        return {
          ok: true,
          overrides: good,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
          trace: { regionCount: 3, picked: { decision: 'edit', found: true }, rounds: [] },
        };
      },
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const url = `/api/remixes/${remixId}/code`;
    const payload = { utterance: 'make it twice as fast' };

    const quiet = await app.inject({ method: 'POST', url, headers: alice, payload });
    expect(quiet.json().debug).toBeUndefined();

    process.env.REMIX_DEBUG = 'true';
    try {
      const loud = await app.inject({ method: 'POST', url, headers: alice, payload });
      expect(loud.json().debug).toMatchObject({ regionCount: 3, picked: { found: true } });
    } finally {
      delete process.env.REMIX_DEBUG;
    }
  });

  it('stops emitting the trace when the operator closes the window, without a deploy', async () => {
    // Clearing the repository variable changes nothing on a revision already
    // running, and the wait for the next deploy would be spent logging players'
    // own words. So closing it is a runtime read, not a release.
    const store = new InMemoryStore();
    await store.setPublication({
      slug: 'dog-dash',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: new Date(0).toISOString(),
    });
    const instance = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
    instance.decorateRequest('user', null);
    instance.addHook('onRequest', async (request) => {
      const uid = request.headers['x-test-uid'];
      (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    });
    let tracePaused = false;
    await registerRemixRoutes(instance, {
      store,
      openProposal,
      gamesStore: stubGamesStore(),
      githubClient: stubGitHubClient([]),
      publishedRef: 'main',
      editingGate: {
        checkAndSpend: async () => ({ allowed: true }),
        isTracePaused: async () => tracePaused,
      },
      codeLane: {
        run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
          const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
          await build(good);
          return {
            ok: true,
            overrides: good,
            region: { file: 'game/runtime.ts', name: 'startGame' },
            rounds: 0,
            tokens: { input: 1, output: 1 },
            trace: { regionCount: 3, picked: { decision: 'edit', found: true }, rounds: [] },
          };
        },
      } as never,
    });
    await instance.ready();
    app = instance;

    const { remixId } = (
      await instance.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })
    ).json();
    const url = `/api/remixes/${remixId}/code`;
    const payload = { utterance: 'make it twice as fast' };

    process.env.REMIX_DEBUG = 'true';
    try {
      expect((await instance.inject({ method: 'POST', url, headers: alice, payload })).json().debug).toBeTruthy();
      tracePaused = true;
      expect((await instance.inject({ method: 'POST', url, headers: alice, payload })).json().debug).toBeUndefined();
    } finally {
      delete process.env.REMIX_DEBUG;
    }
  });

  it('reports a failed code edit without swapping anything', async () => {
    const codeLane = {
      run: async () => ({ ok: false, reason: 'did_not_compile', tokens: { input: 1, output: 1 } }),
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'something impossible' },
    });
    expect(response.json()).toMatchObject({ ok: false, reason: 'did_not_compile' });
    expect(response.json().html).toBeUndefined();
  });

  it('503s both model lanes when their flags are off', async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    const built = await buildTestApp({
      assistant: { assist: async () => ({ lane: 'params' }) } as EditorAssistant,
      codeLane: { run: async () => ({ ok: true }) },
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    for (const lane of ['assist', 'code']) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/remixes/${remixId}/${lane}`,
        headers: alice,
        payload: { utterance: 'do a thing' },
      });
      expect(response.statusCode, lane).toBe(503);
    }
  });

  it('shares declared values, clamped, and never the generated code', async () => {
    const codeLane = {
      run: async (_r: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
        const good = { 'game/runtime.ts': 'export function startGame() { return 0.08; }\n' };
        await build(good);
        return {
          ok: true,
          overrides: good,
          region: { file: 'game/runtime.ts', name: 'startGame' },
          rounds: 0,
          tokens: { input: 1, output: 1 },
        };
      },
    };
    const built = await buildTestApp({ codeLane });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'faster' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/share`,
      headers: alice,
      // 99 is far outside the declared 0.5–3, and must not survive into a link.
      payload: { params: { dogScale: 99, tagline: 'hi' } },
    });
    const body = response.json();
    expect(body.params.dogScale).toBe(3);
    expect(body.params.tagline).toBe('hi');
    expect(JSON.stringify(body)).not.toContain('startGame');
    // The player is told their code edit is not travelling, rather than it silently vanishing.
    expect(body.codeEditsExcluded).toBe(true);
  });
});

/*
 * The two eras. Production answered "game not found" for every slug because the
 * start route proved existence by assembling the whole game and swallowed any
 * failure as an absence; these pin the replacement — a manifest read decides
 * existence, a declaration read decides which lanes exist, and a repo-era game
 * gets the params lane instead of nothing.
 */
describe('remix across the two catalog eras', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  /** No publication record → the repo-era path, exactly like a catalog game. */
  async function repoEraApp(
    overrides: {
      sourceMapCalls?: string[];
      codeLane?: unknown;
      gamesStore?: GamesStore;
      store?: InMemoryStore;
      resolveProposalBase?: (slug: string) => Promise<{
        base: { kind: 'store'; version: string } | { kind: 'repo'; snapshotId: string; sha: string };
        files: Array<{ path: string; content: string }>;
      } | null>;
      onSourcesDelivered?: (input: { jobId: number; slug: string; version: string }) => void;
    } = {},
  ) {
    const store = overrides.store ?? new InMemoryStore();
    await store.upsertUser({ uid: 'g:alice' });
    const seen: Array<Record<string, string> | undefined> = [];
    const instance = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
    instance.decorateRequest('user', null);
    instance.addHook('onRequest', async (request) => {
      const uid = request.headers['x-test-uid'];
      (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    });
    await registerRemixRoutes(instance, {
      store,
      openProposal,
      gamesStore: overrides.gamesStore ?? stubGamesStore(),
      githubClient: stubGitHubClient(seen, overrides.sourceMapCalls ?? []),
      publishedRef: 'main',
      submissionTokenSecret: 'test-submission-secret',
      assistant: { assist: async () => ({ lane: 'params' }) } as EditorAssistant,
      codeLane: (overrides.codeLane ?? { run: async () => ({ ok: true }) }) as never,
      ...(overrides.resolveProposalBase ? { resolveProposalBase: overrides.resolveProposalBase } : {}),
      ...(overrides.onSourcesDelivered ? { onSourcesDelivered: overrides.onSourcesDelivered } : {}),
    });
    await instance.ready();
    return { app: instance, store };
  }

  it('opens a repo-era game on its declaration alone, with the params lane live', async () => {
    ({ app } = await repoEraApp());
    const response = await app!.inject({ method: 'POST', url: '/api/games/repo-game/remix', headers: alice });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // The declaration came from a file read, not from an assembly.
    expect(body.params.dogScale.max).toBe(3);
    // The painter's half too: the content lane is the one editing lane that
    // works catalog-wide, precisely because it needs only this file.
    expect(body.content.maps.defaults.length).toBe(1);
    expect(body.canAssist).toBe(true);
    // ...and the deep lane is offered too: a repo game's sources are reachable
    // through the bundler's walk. Whether this particular game assembles is
    // answered on the first request that needs it, not paid for at open.
    expect(body.canCode).toBe(true);
  });

  it('edits a repo-era game by fetching its sources on the first request that needs them', async () => {
    const mapCalls: string[] = [];
    const seenSources: Array<Record<string, string>> = [];
    ({ app } = await repoEraApp({
      sourceMapCalls: mapCalls,
      codeLane: {
        run: async (
          request: { sources: Record<string, string> },
          build: (o: Record<string, string>) => Promise<{ ok: boolean }>,
        ) => {
          seenSources.push(request.sources);
          const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
          await build(good);
          return { ok: true, overrides: good, region: { file: 'game/runtime.ts', name: 'startGame' } };
        },
      },
    }));
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();

    // Opening cost nothing: the walk is not run until a rebuild is asked for.
    expect(mapCalls).toEqual([]);

    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'add a double jump' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    // The lane saw the game's real code, not just its declaration.
    expect(seenSources[0]['game/runtime.ts']).toContain('return 0.16;');
    expect(mapCalls).toEqual(['dog-dash']);
  });

  it('separates a broken pipeline from a game it cannot edit', async () => {
    // The two used to arrive as the same sentence, and that is how a working
    // feature reads as a missing one: a game with an entry point and a failing
    // bundle looked exactly like a game we had chosen not to support.
    const store = new InMemoryStore();
    const instance = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
    instance.decorateRequest('user', null);
    instance.addHook('onRequest', async (request) => {
      const uid = request.headers['x-test-uid'];
      (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    });
    const client = stubGitHubClient([]) as GitHubClient & {
      getGameSourceMap: (ref: string, slug: string) => Promise<Record<string, string> | null>;
    };
    client.getGameSourceMap = async () => {
      throw new Error('github said no');
    };
    await registerRemixRoutes(instance, {
      store,
      openProposal,
      gamesStore: stubGamesStore(),
      githubClient: client,
      publishedRef: 'main',
      assistant: { assist: async () => ({ lane: 'params' }) } as EditorAssistant,
      codeLane: { run: async () => ({ ok: true }) } as never,
    });
    await instance.ready();
    app = instance;

    const { remixId } = (
      await instance.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })
    ).json();
    const response = await instance.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'add a double jump' },
    });

    // Ours, not the game's: a fault the player can retry, not a limit they cannot.
    expect(response.statusCode).toBe(503);
    expect(response.json().reason).toBe('sources_unavailable');
  });

  it('declines the deep lane for a game whose sources will not assemble', async () => {
    ({ app } = await repoEraApp({ codeLane: { run: async () => ({ ok: true }) } }));
    // `no-sources` has a manifest and a declaration but no assemblable code.
    const { remixId } = (
      await app!.inject({ method: 'POST', url: '/api/games/repo-game/remix', headers: alice })
    ).json();
    const response = await app!.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'add a double jump' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('404s a slug with no manifest — a real absence, not a swallowed failure', async () => {
    ({ app } = await repoEraApp());
    const response = await app!.inject({ method: 'POST', url: '/api/games/not-a-game/remix', headers: alice });
    expect(response.statusCode).toBe(404);
  });

  it('saves a remixed catalog (repo-era) game into Studio by loading delivery sources', async () => {
    const puts: Array<{ slug: string; files: Array<{ path: string; content: string }>; manifest: unknown }> = [];
    const derived: Array<{ slug: string; version: string; name: string }> = [];
    const built = await repoEraApp({ gamesStore: stubGamesStore({ puts, derived }) });
    app = built.app;

    const { remixId } = (
      await app.inject({ method: 'POST', url: '/api/games/catalog-dash/remix', headers: alice })
    ).json();
    const saved = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/save`,
      headers: alice,
      payload: { params: { dogScale: 2.5, tagline: 'go!' } },
    });
    expect(saved.statusCode).toBe(200);
    const body = saved.json() as { slug: string; openPath: string };
    expect(body.slug).not.toBe('catalog-dash');
    expect(body.openPath).toBe(`/play/${body.slug}`);
    expect(puts).toHaveLength(1);
    expect(puts[0].files.some((file) => file.path === 'SPEC.md')).toBe(true);
    expect(puts[0].files.some((file) => file.path === 'index.html')).toBe(true);
    expect(puts[0].files.some((file) => file.path === 'game.ts')).toBe(true);
    expect((puts[0].manifest as { forkedFrom?: { slug: string; version?: string } }).forkedFrom).toEqual({
      slug: 'catalog-dash',
      version: 'refsha1',
    });
    expect(derived).toEqual([{ slug: body.slug, version: 'v-saved', name: 'preview.html' }]);
    expect(await built.store.getPublication(body.slug)).toBeNull();
  });
});

/*
 * One instance is not the world. The app runs with --max-instances 4, so the
 * request that starts a remix and the request that uses it routinely land on
 * different containers. A remix that only exists in the memory of the first one
 * would expire at random — the failure everyone would blame on their wifi.
 */
describe('remix survives an instance change', () => {
  const apps: FastifyInstance[] = [];

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    while (apps.length) await apps.pop()!.close();
  });

  /** A container. Two of these share nothing but the catalog, like production. */
  async function instance(now?: () => number) {
    const built = await buildTestApp({
      assistant: {
        assist: async () => ({ lane: 'params', patches: [{ key: 'dogScale', value: 2 }] }),
      } as unknown as EditorAssistant,
      ...(now ? { now } : {}),
    });
    apps.push(built.app);
    return built.app;
  }

  it('answers on a container that never saw the remix start', async () => {
    const first = await instance();
    const second = await instance();
    const { remixId } = (
      await first.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })
    ).json();

    const response = await second.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'make the dog bigger', params: { dogScale: 1, tagline: 'go!' } },
    });
    expect(response.statusCode).toBe(200);
    // Rebuilt from the catalog, so it is the same session: same declaration,
    // same clamping, same answer the first container would have given.
    expect(response.json().values.dogScale).toBe(2);
  });

  it("still 404s another player's remix after the hop — an id is not a bearer token", async () => {
    const first = await instance();
    const second = await instance();
    const { remixId } = (
      await first.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })
    ).json();

    const stolen = await second.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: { 'x-test-uid': 'g:mallory' },
      payload: { utterance: 'make the dog bigger' },
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('is reachable through the real app — the router ceiling matches the minter', () => {
    // A remix id carries the slug, so it runs past Fastify's 100-character
    // default and the router answers 414 before any handler. That failure would
    // be invisible in these tests, which build their own instance, so the
    // production wiring is asserted at the source.
    const appSource = readFileSync(new URL('../platform/app.ts', import.meta.url), 'utf8');
    expect(appSource).toContain('routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH }');
    // The bound has to cover the longest id the minter can produce: the format
    // preamble plus a slug at its schema maximum.
    expect(MAX_REMIX_ID_LENGTH).toBeGreaterThanOrEqual('1.'.length + 12 + 1 + 10 + 1 + 6 + 1 + 80);
  });

  it('honours the original expiry rather than restarting the clock', async () => {
    const start = 1_000_000;
    const first = await instance(() => start);
    const { remixId } = (
      await first.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })
    ).json();

    // A container whose clock is past the TTL must not resurrect it.
    const later = await instance(() => start + REMIX_TTL_MS + 1);
    const response = await later.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'make the dog bigger' },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('remix save as yours', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  it('saves a remixed store game as a private Studio draft — never a publication', async () => {
    const puts: Array<{ slug: string; files: Array<{ path: string; content: string }>; manifest: unknown }> = [];
    const derived: Array<{ slug: string; version: string; name: string }> = [];
    const built = await buildTestApp({
      gamesStore: stubGamesStore({ puts, derived }),
      assistant: {
        assist: async () => ({
          lane: 'params',
          patches: [{ key: 'dogScale', value: 2 }],
          values: { dogScale: 2, tagline: 'go!' },
          summary: { en: 'Bigger dog.', pl: 'Większy pies.' },
        }),
      } as EditorAssistant,
    });
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/assist`,
      headers: alice,
      payload: { utterance: 'bigger dog', params: { dogScale: 1, tagline: 'go!' } },
    });

    const saved = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/save`,
      headers: alice,
      payload: { params: { dogScale: 2, tagline: 'go!' } },
    });
    expect(saved.statusCode).toBe(200);
    const body = saved.json() as {
      slug: string;
      token: string;
      version: string;
      openPath: string;
    };
    expect(body.slug).not.toBe('dog-dash');
    expect(body.slug).toMatch(/^remix-of-/);
    expect(body.openPath).toBe(`/play/${body.slug}`);
    expect(body.token).toBeTruthy();
    expect(puts).toHaveLength(1);
    expect((puts[0].manifest as { requireCompiledEditor?: boolean }).requireCompiledEditor).toBe(true);
    expect(puts[0].slug).toBe(body.slug);
    expect(
      (puts[0].manifest as { origin?: string; forkedFrom?: { slug: string; version?: string }; deliveryMode?: string })
        .origin,
    ).toBe('remix');
    expect((puts[0].manifest as { forkedFrom?: { slug: string; version?: string } }).forkedFrom).toEqual({
      slug: 'dog-dash',
      version: 'v1',
    });
    expect((puts[0].manifest as { deliveryMode?: string }).deliveryMode).toBe('preview');
    expect(derived).toEqual([{ slug: body.slug, version: 'v-saved', name: 'preview.html' }]);

    const job = await built.store.getSubmissionBySlug(body.slug);
    expect(job?.ownerUid).toBe('g:alice');
    expect(job?.state).toBe('ready_for_review');
    expect(job?.previewVersion).toBe('v-saved');
    expect(job?.deliveredVersion).toBe('v-saved');
    expect(job?.transitions?.some((transition) => transition.reason === 'remix_saved')).toBe(true);
    expect(await built.store.getPublication('dog-dash')).toMatchObject({ state: 'published', currentVersion: 'v1' });
    expect(await built.store.getPublication(body.slug)).toBeNull();

    // Preview assembly must see baked defaults — not the parent's — or Studio plays
    // the original game after "Make it mine" (Codex P2 on #590).
    const saveRebuild = built.seen.at(-1);
    expect(saveRebuild?.['EDITOR.json']).toContain('"dogScale"');
    expect(saveRebuild?.['EDITOR.json']).toMatch(/"default"\s*:\s*2/);
  });

  it('refuses save with nothing changed', async () => {
    const built = await buildTestApp();
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/save`,
      headers: alice,
      payload: { params: { dogScale: 1, tagline: 'go!' } },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().reason).toBe('no_changes');
  });
});

describe('remix propose', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  const PROPOSE_BODY = {
    title: 'makes game harder',
    description: 'Reduced the race time limit so rounds feel tighter and more tense.',
    params: { dogScale: 2, tagline: 'go!' },
  };

  it('proposes a params-only change on a store-lane game', async () => {
    const puts: Array<{ slug: string; files: Array<{ path: string; content: string }>; manifest: unknown }> = [];
    const gated: Array<{ jobId: number; slug: string; version: string }> = [];
    const built = await buildTestApp({
      gamesStore: stubGamesStore({ puts }),
      onSourcesDelivered: (input) => {
        gated.push(input);
      },
    });
    app = built.app;

    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: PROPOSE_BODY,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ proposal: { state: 'checking' } });
    expect(puts).toHaveLength(1);
    expect(puts[0].slug).toBe('dog-dash');
    expect((puts[0].manifest as { deliveryMode?: string }).deliveryMode).toBe('proposal');
    const editor = puts[0].files.find((file) => file.path === 'EDITOR.json')?.content ?? '';
    expect(editor).toMatch(/"default"\s*:\s*2/);
    expect(gated).toHaveLength(1);
    expect(gated[0].slug).toBe('dog-dash');

    const proposals = await built.store.listProposals({ proposerUid: 'g:alice' });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      targetSlug: 'dog-dash',
      base: { kind: 'store', version: 'v1' },
      state: 'submitted',
    });
  });

  it('proposes a catalog (repo-lane) remix once the archive-backed base is wired', async () => {
    const puts: Array<{ slug: string; files: Array<{ path: string; content: string }>; manifest: unknown }> = [];
    const built = await buildTestApp({
      gamesStore: stubGamesStore({ puts }),
      resolveProposalBase: async (slug) => {
        if (slug !== 'catalog-dash') return null;
        return {
          base: { kind: 'repo', snapshotId: 'snap-1', sha: 'abc123def' },
          files: Object.entries(SOURCES).map(([path, content]) => ({ path, content })),
        };
      },
    });
    // No publication for catalog-dash — repo-era start path.
    app = built.app;
    // buildTestApp publishes dog-dash; catalog-dash is reached through the same github stub.
    const { remixId } = (
      await app.inject({ method: 'POST', url: '/api/games/catalog-dash/remix', headers: alice })
    ).json();

    const refused = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: { title: 'x', description: 'short' },
    });
    // Sanity: without a resolver on a *different* harness this used to 409 not_proposable.
    // Here the resolver is wired; a short description is just validation.
    expect(refused.statusCode).toBe(400);

    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: PROPOSE_BODY,
    });
    expect(response.statusCode).toBe(200);
    expect(puts).toHaveLength(1);
    expect(puts[0].slug).toBe('catalog-dash');
    expect(puts[0].files.some((file) => file.path === 'game.ts')).toBe(true);
    expect(puts[0].files.some((file) => file.path === 'SPEC.md')).toBe(true);

    const proposals = await built.store.listProposals({ proposerUid: 'g:alice' });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      targetSlug: 'catalog-dash',
      targetOwnerUid: null,
      base: { kind: 'repo', snapshotId: 'snap-1', sha: 'abc123def' },
      state: 'submitted',
    });
  });

  it('keeps the snapshot-pinned base when session.sources drift from publishedRef', async () => {
    // Repo-lane sessions load EDITOR.json from publishedRef at start; the proposal base
    // is pinned to the snapshot commit. If those disagree, the candidate must still
    // start from the snapshot — otherwise `base` and the files disagree.
    const snapshotEditor = JSON.stringify({
      version: 1,
      params: {
        dogScale: { type: 'number', min: 0.5, max: 3, default: 1, label: { en: 'Dog size' } },
        tagline: { type: 'text', max: 40, default: 'snapshot!', label: { en: 'Tagline' } },
      },
    });
    const puts: Array<{ slug: string; files: Array<{ path: string; content: string }> }> = [];
    const built = await buildTestApp({
      gamesStore: stubGamesStore({ puts }),
      resolveProposalBase: async (slug) => {
        if (slug !== 'catalog-dash') return null;
        return {
          base: { kind: 'repo', snapshotId: 'snap-1', sha: 'snapsha' },
          files: Object.entries({ ...SOURCES, 'EDITOR.json': snapshotEditor }).map(([path, content]) => ({
            path,
            content,
          })),
        };
      },
    });
    app = built.app;
    const { remixId } = (
      await app.inject({ method: 'POST', url: '/api/games/catalog-dash/remix', headers: alice })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: {
        title: 'keep the pin',
        description: 'Candidate must start from the snapshot commit, not publishedRef.',
        params: { dogScale: 2, tagline: 'snapshot!' },
      },
    });
    expect(response.statusCode).toBe(200);
    const editor = puts[0]?.files.find((file) => file.path === 'EDITOR.json')?.content ?? '';
    // Snapshot's default tagline survived; publishedRef's "go!" did not leak in.
    expect(editor).toContain('snapshot!');
    expect(editor).not.toContain('"go!"');
    expect(editor).toMatch(/"default"\s*:\s*2/);
  });

  it('still refuses a catalog remix when the archive base is unavailable', async () => {
    const built = await buildTestApp({
      resolveProposalBase: async () => null,
    });
    app = built.app;
    const { remixId } = (
      await app.inject({ method: 'POST', url: '/api/games/catalog-dash/remix', headers: alice })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: PROPOSE_BODY,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('not_proposable');
  });

  it('refuses propose with nothing changed', async () => {
    const built = await buildTestApp();
    app = built.app;
    const { remixId } = (await app.inject({ method: 'POST', url: '/api/games/dog-dash/remix', headers: alice })).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: {
        title: 'no real change',
        description: 'Trying to propose the defaults should not open a review.',
        params: { dogScale: 1, tagline: 'go!' },
      },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('no_changes');
  });
});

/*
 * Over a real socket, because `inject()` is what hid the defect this pins.
 *
 * A mock request is never a stream that ends, so `request.raw.destroyed` stayed
 * false in every test while being true for every real request with a body — Node
 * destroys the request stream once its payload has been consumed. The route read
 * that as "the player walked away", discarded the finished rebuild and returned
 * without replying, so production answered 200 with an empty body for every code
 * edit. Twenty passing route tests could not see it.
 */
describe('remix code lane over a real connection', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    process.env.EDITOR_ASSIST = 'true';
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.EDITOR_ASSIST;
    delete process.env.CODE_LANE;
    if (app) await app.close();
    app = null;
  });

  it('lands an edit for a caller who is still there', async () => {
    const built = await buildTestApp({
      codeLane: {
        run: async (_request: unknown, build: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
          const good = { 'game/runtime.ts': 'export function startGame() {\n  return 0.08;\n}\n' };
          await build(good);
          // Full outcome shape, as the lane really returns: a stub that omits
          // fields the route does not read yet ages into a false green.
          return {
            ok: true,
            overrides: good,
            region: { file: 'game/runtime.ts', name: 'startGame' },
            rounds: 0,
            tokens: { input: 1, output: 1 },
          };
        },
      },
    });
    app = built.app;
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const started = await fetch(`${address}/api/games/dog-dash/remix`, { method: 'POST', headers: alice });
    const { remixId } = (await started.json()) as { remixId: string };

    const response = await fetch(`${address}/api/remixes/${remixId}/code`, {
      method: 'POST',
      headers: { ...alice, 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: 'make it twice as fast' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; html?: string };
    // The body is the whole point: an empty 200 is what this defect produced.
    expect(body.ok).toBe(true);
    expect(body.html).toContain('return 0.08;');
  });
});
