import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRemixRoutes } from './remix.js';
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
function stubGitHubClient(seen: Array<Record<string, string> | undefined>): GitHubClient {
  return {
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

async function buildTestApp(overrides: { assistant?: EditorAssistant; codeLane?: unknown } = {}) {
  const store = new InMemoryStore();
  await store.setPublication({
    slug: 'dog-dash',
    state: 'published',
    currentVersion: 'v1',
    publishedAt: new Date(0).toISOString(),
  });
  const seen: Array<Record<string, string> | undefined> = [];
  const app = Fastify();
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
