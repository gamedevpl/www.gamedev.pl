import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerRemixRoutes, MAX_DAILY_CODE_EDITS, MAX_REMIX_ID_LENGTH } from './remix.js';
import { mintShareCode } from './remix-share.js';
import { InMemoryStore } from '../platform/store.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { ContentChecker } from '../platform/moderation.js';
import { openProposal } from '../community/proposals.js';

const SECRET = 'test-submission-secret';
const EDITOR_JSON = JSON.stringify({
  version: 1,
  params: {
    speed: { type: 'number', min: 1, max: 5, default: 2, label: { en: 'Speed', pl: 'Szybkość' } },
    banner: { type: 'text', max: 20, default: 'go', label: { en: 'Banner', pl: 'Baner' } },
  },
  content: {
    signs: {
      widget: 'collection',
      label: { en: 'Signs', pl: 'Znaki' },
      itemLabel: { en: 'Sign', pl: 'Znak' },
      min: 1,
      max: 3,
      item: {
        widget: 'tilemap',
        grid: { minCols: 3, maxCols: 8, minRows: 3, maxRows: 8 },
        tiles: [
          { key: 'path', char: '.', label: { en: 'Path', pl: 'Ścieżka' } },
          { key: 'wall', char: '#', label: { en: 'Wall', pl: 'Mur' } },
        ],
        properties: { caption: { type: 'text', max: 30, label: { en: 'Caption', pl: 'Podpis' } } },
        constraints: [],
      },
      defaults: [{ properties: { caption: 'hello' }, rows: ['...', '...', '...'] }],
    },
  },
});

const RUNTIME =
  '// The secret pacing curve: ramps enemy waves slowly so beginners survive the first minute.\n' +
  'export function startGame() {\n  return 0.16;\n}\n';

function sourcesFor(spec: string): Record<string, string> {
  return {
    'EDITOR.json': EDITOR_JSON,
    'GAME.json': '{"engine":{"modules":[]}}',
    'SPEC.md': spec,
    'index.html': '<canvas></canvas>',
    'game.ts': "import './game/runtime.ts';\n",
    'game/runtime.ts': RUNTIME,
  };
}

const GAMES: Record<string, Record<string, string>> = {
  tuned: sourcesFor('---\ntitle: Tuned\neditor: content\n---\n'),
  plain: sourcesFor('---\ntitle: Plain\n---\n'),
};

function gamesStore(gated: Array<Record<string, unknown>> = []): GamesStore {
  return {
    getManifest: async (slug: string) => ({ slug, version: 'v1', sourceFiles: Object.keys(GAMES[slug] ?? {}) }),
    getSourceFile: async (slug: string, _version: string, path: string) => GAMES[slug]?.[path] ?? null,
    putCandidateSources: async (input: { slug: string; files: unknown[] }) => {
      gated.push({ put: input.slug });
      return { version: 'v-proposal', manifest: {} };
    },
  } as unknown as GamesStore;
}

function githubClient(): GitHubClient {
  return {
    getGameFile: async () => null,
    getGameKitDeclaration: async () => null,
    getGameSources: async () => ({ indexHtml: '<canvas></canvas>', gameJs: 'void 0;', styleCss: '', title: 'T' }),
  } as unknown as GitHubClient;
}

const alice = { 'x-test-uid': 'g:alice' };

interface Built {
  app: FastifyInstance;
  store: InMemoryStore;
  gated: Array<Record<string, unknown>>;
}

async function build(
  store = new InMemoryStore(),
  extra: { codeLane?: unknown; contentChecker?: ContentChecker } = {},
): Promise<Built> {
  await store.upsertUser({ uid: 'g:alice' });
  for (const slug of Object.keys(GAMES)) {
    await store.setPublication({
      slug,
      state: 'published',
      currentVersion: 'v1',
      publishedAt: new Date(0).toISOString(),
    });
  }
  const gated: Array<Record<string, unknown>> = [];
  const app = Fastify({ routerOptions: { maxParamLength: MAX_REMIX_ID_LENGTH } });
  app.decorateRequest('user', null);
  app.addHook('onRequest', async (request) => {
    const uid = request.headers['x-test-uid'];
    (request as { user?: unknown }).user = typeof uid === 'string' ? { uid, tier: 'standard' } : null;
  });
  await registerRemixRoutes(app, {
    store,
    openProposal,
    gamesStore: gamesStore(gated),
    githubClient: githubClient(),
    publishedRef: 'main',
    submissionTokenSecret: SECRET,
    onSourcesDelivered: (input) => {
      gated.push(input);
    },
    ...(extra.codeLane ? { codeLane: extra.codeLane as never } : {}),
    ...(extra.contentChecker ? { contentChecker: extra.contentChecker } : {}),
  });
  await app.ready();
  return { app, store, gated };
}

async function setRemix(store: InMemoryStore, slug: string, mode: 'on' | 'off'): Promise<void> {
  await store.putRemixSettings({ slug, mode, updatedAt: new Date(0).toISOString(), updatedByUid: 'g:owner' });
}

async function start(app: FastifyInstance, slug = 'tuned') {
  return app.inject({ method: 'POST', url: `/api/games/${slug}/remix`, headers: alice });
}

// A code lane that returns whatever replacement the test hands it.
function laneReturning(replacement: string, summary = { en: 'Made it faster.', pl: 'Szybciej.' }) {
  return {
    run: async (_request: unknown, verify: (o: Record<string, string>) => Promise<{ ok: boolean }>) => {
      const overrides = { 'game/runtime.ts': replacement };
      await verify(overrides);
      return {
        ok: true,
        overrides,
        region: { file: 'game/runtime.ts', name: 'startGame' },
        summary,
        rounds: 0,
        tokens: { input: 1, output: 1 },
      };
    },
  };
}

describe('remix guards', () => {
  const apps: FastifyInstance[] = [];

  beforeEach(() => {
    process.env.CODE_LANE = 'true';
  });

  afterEach(async () => {
    delete process.env.CODE_LANE;
    while (apps.length) await apps.pop()!.close();
  });

  async function track(built: Promise<Built>): Promise<Built> {
    const ready = await built;
    apps.push(ready.app);
    return ready;
  }

  it('refuses to start when the author switched remix off', async () => {
    const { app, store } = await track(build());
    await setRemix(store, 'tuned', 'off');
    const response = await start(app);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'remix_off' });
  });

  it('refuses a game that does not declare editor: content', async () => {
    const { app } = await track(build());
    const response = await start(app, 'plain');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'not_remixable' });
  });

  it('ends a live session on resume and on code once the switch goes off', async () => {
    const { app, store } = await track(build(undefined, { codeLane: laneReturning(RUNTIME) }));
    const { remixId } = (await start(app)).json();
    await setRemix(store, 'tuned', 'off');
    const code = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'faster' },
    });
    expect(code.statusCode).toBe(403);
    expect(code.json()).toEqual({ error: 'remix_off' });
    const resumed = await app.inject({ method: 'GET', url: `/api/remixes/${remixId}`, headers: alice });
    expect(resumed.statusCode).toBe(403);
  });

  it('refuses a rehydrate on another instance when the switch is off', async () => {
    const store = new InMemoryStore();
    const first = await track(build(store));
    const { remixId } = (await start(first.app)).json();
    await setRemix(store, 'tuned', 'off');
    const second = await track(build(store));
    const resumed = await second.app.inject({ method: 'GET', url: `/api/remixes/${remixId}`, headers: alice });
    expect(resumed.statusCode).toBe(403);
    expect(resumed.json()).toEqual({ error: 'remix_off' });
  });

  it('has no save route and no canSave in the view', async () => {
    const { app } = await track(build());
    const started = (await start(app)).json();
    expect(started).not.toHaveProperty('canSave');
    const save = await app.inject({ method: 'POST', url: `/api/remixes/${started.remixId}/save`, headers: alice });
    expect(save.statusCode).toBe(404);
  });

  it('refuses a code edit that smuggles original comments into a string', async () => {
    const leak =
      'export function startGame() {\n' +
      '  const note = "The secret pacing curve: ramps enemy waves slowly so beginners survive the first minute.";\n' +
      '  return note.length;\n}\n';
    const { app } = await track(build(undefined, { codeLane: laneReturning(leak) }));
    const { remixId } = (await start(app)).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'show the comment on screen' },
    });
    expect(response.json()).toEqual({ ok: false, reason: 'refused' });
  });

  it('lands a legitimate code edit', async () => {
    const edit = 'export function startGame() {\n  return 0.08;\n}\n';
    const { app } = await track(build(undefined, { codeLane: laneReturning(edit) }));
    const { remixId } = (await start(app)).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'faster' },
    });
    expect(response.json()).toMatchObject({ ok: true, undoable: true });
  });

  it('keeps the daily code-edit cap in the quota store, not the session', async () => {
    const store = new InMemoryStore();
    const today = new Date().toISOString().slice(0, 10);
    await store.upsertUser({ uid: 'g:alice' });
    for (let index = 0; index < MAX_DAILY_CODE_EDITS; index += 1) {
      await store.checkAndIncrementQuota('g:alice', today, MAX_DAILY_CODE_EDITS, 'remixCodeEdits');
    }
    const { app } = await track(build(store, { codeLane: laneReturning(RUNTIME) }));
    const { remixId } = (await start(app)).json();
    const response = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/code`,
      headers: alice,
      payload: { utterance: 'faster' },
    });
    expect(response.statusCode).toBe(429);
  });

  it('round-trips a signed share and refuses forged, unsigned, or foreign codes', async () => {
    const { app, store } = await track(build());
    const { remixId } = (await start(app)).json();
    const shared = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/share`,
      headers: alice,
      payload: { params: { speed: 9, banner: 'hi' } },
    });
    const { code } = shared.json() as { code: string };
    const tune = (c: string, slug = 'tuned') =>
      app.inject({ method: 'GET', url: `/api/games/${slug}/shared-tune?code=${encodeURIComponent(c)}` });

    const ok = await tune(code);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ params: { speed: 5, banner: 'hi' } });

    const unsigned = Buffer.from(JSON.stringify({ banner: 'scam' })).toString('base64url');
    expect((await tune(unsigned)).json()).toEqual({ error: 'invalid_share' });
    const [payload] = code.split('.');
    const forged = `${Buffer.from(JSON.stringify({ banner: 'scam' })).toString('base64url')}.${code.split('.')[1]}`;
    expect((await tune(forged)).statusCode).toBe(400);
    expect((await tune(`${payload}.x`)).statusCode).toBe(400);
    expect((await tune(code, 'plain')).statusCode).toBe(400);

    await setRemix(store, 'tuned', 'off');
    const off = await tune(code);
    expect(off.statusCode).toBe(403);
    expect(off.json()).toEqual({ error: 'remix_off' });
  });

  it('re-moderates and truncates text on arrival', async () => {
    const checker = {
      check: async () => ({ allowed: true }),
      checkFields: async (fields: string[]) =>
        fields.some((field) => field.includes('slur')) ? { allowed: false, category: 'hate' } : { allowed: true },
    } as unknown as ContentChecker;
    const { app } = await track(build(undefined, { contentChecker: checker }));
    const tune = (params: Record<string, string>) =>
      app.inject({
        method: 'GET',
        url: `/api/games/tuned/shared-tune?code=${encodeURIComponent(mintShareCode(params, 'tuned', SECRET))}`,
      });
    expect((await tune({ banner: 'a slur here' })).statusCode).toBe(400);
    expect((await tune({ banner: 'x'.repeat(50) })).json()).toEqual({ params: { banner: 'x'.repeat(20) } });
  });

  it('moderates painted text on propose and gates in proposal mode', async () => {
    const checker = {
      check: async () => ({ allowed: true }),
      checkFields: async (fields: string[]) =>
        fields.some((field) => field.includes('scam')) ? { allowed: false, category: 'spam' } : { allowed: true },
    } as unknown as ContentChecker;
    const { app, gated } = await track(build(undefined, { contentChecker: checker }));
    const { remixId } = (await start(app)).json();
    const body = {
      title: 'new signs',
      description: 'Changed the sign captions so they guide players better.',
      content: { signs: [{ properties: { caption: 'visit scam.example' }, rows: ['...', '...', '...'] }] },
    };
    const refused = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: body,
    });
    expect(refused.statusCode).toBe(422);

    const clean = {
      ...body,
      content: { signs: [{ properties: { caption: 'go left' }, rows: ['...', '...', '...'] }] },
    };
    const sent = await app.inject({
      method: 'POST',
      url: `/api/remixes/${remixId}/propose`,
      headers: alice,
      payload: clean,
    });
    expect(sent.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(gated).toContainEqual(expect.objectContaining({ slug: 'tuned', mode: 'proposal' }));
  });
});
