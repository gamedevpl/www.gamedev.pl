import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRemixRoutes, MAX_REMIX_ID_LENGTH, REMIX_TTL_MS } from './remix.js';
import { InMemoryStore } from './store.js';
import type { GamesStore } from './games-store.js';
import type { GitHubClient } from './github-client.js';
import type { EditorAssistant } from './editor-assist.js';

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

function stubGamesStore(): GamesStore {
  return {
    getManifest: async () => ({
      slug: 'dog-dash',
      version: 'v1',
      createdAt: 'now',
      issueNumber: 1,
      engineRef: 'abc123',
      sourceFiles: Object.keys(SOURCES),
    }),
    getSourceFile: async (_slug: string, _version: string, path: string) => SOURCES[path] ?? null,
  } as unknown as GamesStore;
}

/** Records what the assembler was asked to build, so overrides can be asserted. */
function stubGitHubClient(
  seen: Array<Record<string, string> | undefined>,
  sourceMapCalls: string[] = [],
): GitHubClient {
  return {
    getGameFile: async (_ref: string, slug: string, path: string) =>
      slug === 'dog-dash' || slug === 'repo-game' ? (SOURCES[path] ?? null) : null,
    // The bundler's walk, stubbed: the game's own TypeScript, keyed relatively.
    getGameSourceMap: async (_ref: string, slug: string) => {
      sourceMapCalls.push(slug);
      // `repo-game` deliberately has none: a game that declares itself but whose
      // code will not assemble is the case the deep lane has to decline.
      if (slug !== 'dog-dash') return null;
      return { 'game.ts': SOURCES['game.ts'], 'game/runtime.ts': SOURCES['game/runtime.ts'] };
    },
    getGameSources: async (_ref: string, slug: string, overrides?: Record<string, string>) => {
      // Like the real client: a slug with no game directory on the ref is null.
      if (slug !== 'dog-dash') return null;
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
  } = {},
) {
  const store = new InMemoryStore();
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
    gamesStore: stubGamesStore(),
    githubClient: stubGitHubClient(seen),
    publishedRef: 'main',
    ...(overrides.assistant ? { assistant: overrides.assistant } : {}),
    ...(overrides.codeLane ? { codeLane: overrides.codeLane as never } : {}),
    ...(overrides.isAbandoned ? { isAbandoned: overrides.isAbandoned } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
  });
  await app.ready();
  return { app, seen };
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
    for (const lane of ['assist', 'code', 'share']) {
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
  async function repoEraApp(overrides: { sourceMapCalls?: string[]; codeLane?: unknown } = {}) {
    const store = new InMemoryStore();
    const seen: Array<Record<string, string> | undefined> = [];
    const instance = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
    instance.decorateRequest('user', null);
    instance.addHook('onRequest', async (request) => {
      const uid = request.headers['x-test-uid'];
      (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
    });
    await registerRemixRoutes(instance, {
      store,
      gamesStore: stubGamesStore(),
      githubClient: stubGitHubClient(seen, overrides.sourceMapCalls ?? []),
      publishedRef: 'main',
      assistant: { assist: async () => ({ lane: 'params' }) } as EditorAssistant,
      codeLane: (overrides.codeLane ?? { run: async () => ({ ok: true }) }) as never,
    });
    await instance.ready();
    return instance;
  }

  it('opens a repo-era game on its declaration alone, with the params lane live', async () => {
    app = await repoEraApp();
    const response = await app.inject({ method: 'POST', url: '/api/games/repo-game/remix', headers: alice });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // The declaration came from a file read, not from an assembly.
    expect(body.params.dogScale.max).toBe(3);
    expect(body.canAssist).toBe(true);
    // ...and the deep lane is offered too: a repo game's sources are reachable
    // through the bundler's walk. Whether this particular game assembles is
    // answered on the first request that needs it, not paid for at open.
    expect(body.canCode).toBe(true);
  });

  it('edits a repo-era game by fetching its sources on the first request that needs them', async () => {
    const mapCalls: string[] = [];
    const seenSources: Array<Record<string, string>> = [];
    app = await repoEraApp({
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
    });
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
    app = await repoEraApp({ codeLane: { run: async () => ({ ok: true }) } });
    // `no-sources` has a manifest and a declaration but no assemblable code.
    const { remixId } = (
      await app.inject({ method: 'POST', url: '/api/games/repo-game/remix', headers: alice })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'add a double jump' },
    });
    // A fact about this game, not a failure of the request.
    expect(response.statusCode).toBe(409);
  });

  it('404s a slug with no manifest — a real absence, not a swallowed failure', async () => {
    app = await repoEraApp();
    const response = await app.inject({ method: 'POST', url: '/api/games/not-a-game/remix', headers: alice });
    expect(response.statusCode).toBe(404);
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
    const appSource = readFileSync(new URL('./app.ts', import.meta.url), 'utf8');
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
