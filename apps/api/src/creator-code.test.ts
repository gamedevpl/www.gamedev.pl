import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { createGcsObjectStore, type GcsObjectStore } from './delivery/gcs-sign.js';
import { createGcsGamesStore, type GamesStore } from './delivery/games-store.js';
import type { GitHubClient } from './catalog/github-client.js';
import { KIT_ROOT_DIR } from './agent-surface/kit-registry.js';
import { InMemoryStore, type SourceFile } from './store.js';
import { StubTabCompleter, type TabCompleter } from './tab-complete.js';
import type { SourceDeliveryService } from './delivery/source-delivery.js';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

/** Same fake GCS HTTP layer games-store.test.ts uses — real store logic, no network. */
function stubGcs() {
  const objects = new Map<string, Buffer>();
  const generations = new Map<string, number>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      const ifMatch = parsed.searchParams.get('ifGenerationMatch');
      const current = generations.get(name) ?? 0;
      if (ifMatch !== null && Number(ifMatch) !== current) {
        return new Response('Precondition Failed', { status: 412 });
      }
      objects.set(name, Buffer.from(init.body as Uint8Array));
      const next = current + 1;
      generations.set(name, next);
      return new Response(JSON.stringify({ generation: String(next) }), { status: 200 });
    }
    if (init.method === 'DELETE') {
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      objects.delete(name);
      generations.delete(name);
      return new Response(null, { status: 200 });
    }
    if (!href.includes('/o/')) {
      const parsed = new URL(href);
      const prefix = parsed.searchParams.get('prefix') ?? '';
      const prefixes = new Set<string>();
      for (const name of objects.keys()) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash !== -1) prefixes.add(`${prefix}${rest.slice(0, slash + 1)}`);
      }
      return new Response(JSON.stringify({ prefixes: [...prefixes] }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    const generation = String(generations.get(name) ?? 1);
    return new Response(new Uint8Array(body), { status: 200, headers: { 'x-goog-generation': generation } });
  }) as unknown as typeof fetch;
  return { impl, objects, generations };
}

function gamesStore(): GamesStore {
  const { impl } = stubGcs();
  return createGcsGamesStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });
}

const ENGINE_REF = 'deadbeef0123456789abcdef0123456789abcdef';
const TAR_BLOCK = 512;

/** Minimal single-file ustar tarball — same recipe kit-files.test.ts uses. */
function kitTarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) => {
    const path = `${KIT_ROOT_DIR}/${name}`;
    const payload = Buffer.from(body, 'utf8');
    const header = Buffer.alloc(TAR_BLOCK);
    header.write(path, 0, 100, 'utf8');
    header.write(`${payload.length.toString(8).padStart(11, '0')} `, 124, 12, 'utf8');
    header.write('0', 156, 1, 'utf8');
    header.write('ustar\0', 257, 6, 'utf8');
    const padding = Buffer.alloc((TAR_BLOCK - (payload.length % TAR_BLOCK)) % TAR_BLOCK);
    return Buffer.concat([header, payload, padding]);
  });
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(TAR_BLOCK * 2)]));
}

/** A games store and an object store sharing one fake bucket, with a kit published. */
function storesWithKit(kitDts: string): { games: GamesStore; objectStore: GcsObjectStore } {
  const { impl, objects } = stubGcs();
  const tarball = kitTarball({ 'shared/game-kit.d.ts': kitDts });
  objects.set(
    'kits/current.json',
    Buffer.from(JSON.stringify({ current: ENGINE_REF, previous: null, updatedAt: '2026-08-10T00:00:00.000Z' })),
  );
  objects.set(`kits/${ENGINE_REF}.tgz`, tarball);
  objects.set(
    `kits/${ENGINE_REF}.json`,
    Buffer.from(JSON.stringify({ sha256: createHash('sha256').update(tarball).digest('hex') })),
  );
  const games = createGcsGamesStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });
  const objectStore = createGcsObjectStore({ bucket: 'b', getAccessToken: async () => 'token', fetchImpl: impl });
  return { games, objectStore };
}

describe('the Code surface routes (creator-code.ts)', () => {
  let store: InMemoryStore;
  let games: GamesStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    games = gamesStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.upsertUser({ uid: 'g:other' });
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
  });

  async function withApp<T>(
    fn: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<T>,
    options: {
      objectStore?: GcsObjectStore;
      games?: GamesStore;
      tabCompleter?: TabCompleter;
      githubClient?: GitHubClient;
      sourceDelivery?: SourceDeliveryService;
    } = {},
  ): Promise<T> {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret,
        agentChannel: { gamesStore: options.games ?? games, objectStore: options.objectStore },
        // registerSubmissionRoutes only honors an injected client alongside a token.
        ...(options.githubClient ? { githubClient: options.githubClient, githubToken: 'test-github-token' } : {}),
      },
      creatorCodeRoutes: {
        store,
        gamesStore: options.games ?? games,
        objectStore: options.objectStore,
        githubClient: options.githubClient,
        sourceDelivery: options.sourceDelivery,
      },
      tabCompleter: options.tabCompleter,
    });
    try {
      return await fn(app);
    } finally {
      await app.close();
    }
  }

  describe('GET /api/me/studio/games/:slug/sources', () => {
    it('404s for a slug the caller does not own — never 403', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:other'),
        });
        expect(res.statusCode).toBe(404);
      }));

    it('404s when the CODE_SURFACE kill switch is off', async () => {
      const prior = process.env.CODE_SURFACE;
      process.env.CODE_SURFACE = 'false';
      try {
        await withApp(async (app) => {
          const res = await app.inject({
            method: 'GET',
            url: '/api/me/studio/games/sky-dodge/sources',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(404);
        });
      } finally {
        if (prior === undefined) delete process.env.CODE_SURFACE;
        else process.env.CODE_SURFACE = prior;
      }
    });

    it('merges a staged edit over the delivered version, stamping who staged it (CE-03, CE-04)', async () =>
      withApp(async (app) => {
        await games.putCandidateSources({
          slug: 'sky-dodge',
          issueNumber: 10,
          files: [
            { path: 'SPEC.md', content: '# Sky Dodge' },
            {
              path: 'GAME.json',
              content: JSON.stringify({
                engine: { modules: [] },
                howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
              }),
            },
            { path: 'game.ts', content: 'export const boot = 1;' },
            { path: 'game/render.ts', content: 'export const paint = 1;' },
          ],
          mode: 'preview',
        });
        await store.setSubmissionDeliveredVersion(10, (await games.listVersions('sky-dodge'))[0]!.version);
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/render.ts',
          content: 'export const paint = 2; // owner edit',
          stagedBy: 'owner',
        });

        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as {
          files: Array<{ path: string; content: string; stagedBy?: string }>;
          readOnly: boolean;
        };
        expect(body.readOnly).toBe(false);
        const render = body.files.find((f) => f.path === 'game/render.ts');
        expect(render?.content).toContain('owner edit');
        expect(render?.stagedBy).toBe('owner');
        const untouched = body.files.find((f) => f.path === 'game.ts');
        expect(untouched?.content).toBe('export const boot = 1;');
        expect(untouched?.stagedBy).toBeUndefined();
      }));

    it('reports readOnly with reason agent_round while a dispatched agent is live', async () =>
      withApp(async (app) => {
        await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });
        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { readOnly: boolean; reason?: string };
        expect(body.readOnly).toBe(true);
        expect(body.reason).toBe('agent_round');
      }));

    it('marks a self-build round as watchable even though it is never read-only', async () =>
      withApp(async (app) => {
        // readOnly needs dispatch.refs; a self-build MCP round has none.
        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { readOnly: boolean; agentRound: boolean };
        expect(body.readOnly).toBe(false);
        expect(body.agentRound).toBe(true);
      }));

    it('keeps watching across the submit handoff, which any later stage undoes', async () =>
      withApp(async (app) => {
        // agentEndedAt is self-clearing: the next stage call deletes it.
        await store.markAgentEnded(10);
        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { agentRound: boolean }).agentRound).toBe(true);
      }));
  });

  describe('PUT /api/me/studio/games/:slug/sources/stage', () => {
    it('stages an owner write and refuses it once an agent round goes live', async () =>
      withApp(async (app) => {
        const ok = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 1;', rebuild: false },
        });
        expect(ok.statusCode).toBe(200);
        const listed = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(listed.files).toEqual([{ path: 'game.ts', bytes: expect.any(Number), stagedBy: 'owner' }]);

        await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });
        const refused = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'x', rebuild: false },
        });
        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({ error: 'agent_round' });
      }));

    it('CE-17: a write into a round that has already closed opens a fresh manual round implicitly', async () =>
      withApp(async (app) => {
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
        const res = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 1;', rebuild: false },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.accepted).toBe(true);
        expect(body.roundOpened).toEqual(expect.any(Number));
        expect(body.roundOpened).not.toBe(10);

        // The closed round's own buffer stays untouched...
        const oldRoundListed = await games.listStagedSources({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
        });
        expect(oldRoundListed.files).toEqual([]);
        // ...and the write landed in the new round's buffer instead.
        const newRoundListed = await games.listStagedSources({
          slug: 'sky-dodge',
          issueNumber: body.roundOpened,
          roundGeneration: 1,
        });
        expect(newRoundListed.files).toEqual([{ path: 'game.ts', bytes: expect.any(Number), stagedBy: 'owner' }]);

        // The new round is now what owner reads resolve to.
        const opened = await store.getSubmission(body.roundOpened);
        expect(opened?.slug).toBe('sky-dodge');
        expect(opened?.ownerUid).toBe('g:creator');
        expect(opened?.state).toBe('queued');
      }));

    it('does not open a second round on a slug that already has an active one', async () =>
      withApp(async (app) => {
        const first = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 1;', rebuild: false },
        });
        expect(first.json().roundOpened).toBeUndefined();

        const second = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 2;', rebuild: false },
        });
        expect(second.json().roundOpened).toBeUndefined();
        const listed = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(listed.files).toEqual([{ path: 'game.ts', bytes: expect.any(Number), stagedBy: 'owner' }]);
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/stage/delete', () => {
    it('stages a deletion marker and refuses it once an agent round goes live', async () =>
      withApp(async (app) => {
        const staged = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 1;', rebuild: false },
        });
        expect(staged.statusCode).toBe(200);

        const deleted = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/delete',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts' },
        });
        expect(deleted.statusCode).toBe(200);
        expect(deleted.json()).toMatchObject({ accepted: true, path: 'game.ts' });
        const listed = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(listed.files).toEqual([{ path: 'game.ts', bytes: 0, deleted: true, stagedBy: 'owner' }]);

        await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });
        const refused = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/delete',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts' },
        });
        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({ error: 'agent_round' });
      }));

    it('CE-17: a delete into a round that has already closed opens a fresh manual round implicitly', async () =>
      withApp(async (app) => {
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/delete',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.accepted).toBe(true);
        expect(body.roundOpened).toEqual(expect.any(Number));
        expect(body.roundOpened).not.toBe(10);
      }));

    it('404s for a slug the caller does not own', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/delete',
          headers: { ...authHeaders('g:other'), 'content-type': 'application/json' },
          payload: { path: 'game.ts' },
        });
        expect(res.statusCode).toBe(404);
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/stage/patch', () => {
    it('CE-17: a patch into a round that has already closed opens a round against the published base', async () =>
      withApp(async (app) => {
        await games.putCandidateSources({
          slug: 'sky-dodge',
          issueNumber: 10,
          files: [
            { path: 'SPEC.md', content: '# Sky Dodge' },
            {
              path: 'GAME.json',
              content: JSON.stringify({
                engine: { modules: [] },
                howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
              }),
            },
            { path: 'game.ts', content: 'export const boot = 1;' },
          ],
          mode: 'preview',
        });
        const version = (await games.listVersions('sky-dodge'))[0]!.version;
        await store.setPublication({
          slug: 'sky-dodge',
          state: 'published',
          currentVersion: version,
          publishedAt: '2026-08-01T00:00:00.000Z',
        });
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/patch',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', old: 'boot = 1', new: 'boot = 2' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.accepted).toBe(true);
        expect(body.baseFrom).toBe('delivery');
        expect(body.roundOpened).toEqual(expect.any(Number));
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/stage/discard', () => {
    it("clears only the owner's own staged paths, leaving an agent's staged work standing", async () =>
      withApp(async () => {
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/agent-file.ts',
          content: 'agent wrote this',
          stagedBy: 'agent',
        });
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/owner-file.ts',
          content: 'owner wrote this',
          stagedBy: 'owner',
        });

        const app = await buildApp({
          store,
          sessionSecret,
          submissionRoutes: { submissionTokenSecret, agentChannel: { gamesStore: games } },
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/discard',
          headers: authHeaders('g:creator'),
        });
        await app.close();

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ cleared: 1 });
        const remaining = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(remaining.files.map((f) => f.path)).toEqual(['game/agent-file.ts']);
      }));

    it("clears a WebMCP/console-authored write too — it is still stagedBy 'owner', agentAssisted is a separate signal", async () =>
      withApp(async () => {
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/agent-file.ts',
          content: 'round-key agent wrote this',
          stagedBy: 'agent',
        });
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/console-file.ts',
          content: 'the owner ran the agent console',
          stagedBy: 'owner',
          agentAssisted: true,
        });

        const app = await buildApp({
          store,
          sessionSecret,
          submissionRoutes: { submissionTokenSecret, agentChannel: { gamesStore: games } },
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/discard',
          headers: authHeaders('g:creator'),
        });
        await app.close();

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ cleared: 1 });
        const remaining = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(remaining.files.map((f) => f.path)).toEqual(['game/agent-file.ts']);
      }));

    it('refuses once an agent round goes live — same guard stage and patch already enforce', async () =>
      withApp(async (app) => {
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game/owner-file.ts',
          content: 'owner wrote this',
          stagedBy: 'owner',
        });
        await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/discard',
          headers: authHeaders('g:creator'),
        });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ error: 'agent_round' });
        const remaining = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        expect(remaining.files.map((f) => f.path)).toEqual(['game/owner-file.ts']);
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/typecheck', () => {
    it('skips checking (ok: true) when no kit is configured — the check cannot run, not "the game is broken"', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/typecheck',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { overlay: [{ path: 'game.ts', content: 'const x: number = "not a number";' }] },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
      }));

    it('reports a real type error once a kit is published, and passes clean code', async () => {
      const { games: withKitGames, objectStore } = storesWithKit('declare const GameKit: { boot(): void };');

      await withApp(
        async (app) => {
          const bad = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/typecheck',
            headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
            payload: { overlay: [{ path: 'game.ts', content: 'const x: number = "not a number";' }] },
          });
          expect(bad.statusCode).toBe(200);
          const badBody = bad.json() as { ok: boolean; errors?: string[] };
          expect(badBody.ok).toBe(false);
          expect(badBody.errors?.[0]).toContain('game.ts');

          const good = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/typecheck',
            headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
            payload: { overlay: [{ path: 'game.ts', content: 'const x: number = 1;' }] },
          });
          expect(good.statusCode).toBe(200);
          expect(good.json()).toEqual({ ok: true });
        },
        { objectStore, games: withKitGames },
      );
    });
  });

  describe('POST /api/me/studio/games/:slug/sources/preview', () => {
    // A minimal getGameSources fake — see github-client.test.ts for real assembly.
    function stubGithubClient(): GitHubClient {
      return {
        getGameSources: async (ref, slug, overrides) => ({
          indexHtml: overrides?.['index.html'] ?? '<div id="game-root"></div>',
          gameJs: `window.__REF__ = ${JSON.stringify(ref)}; ${overrides?.['game.ts'] ?? ''}`,
          styleCss: overrides?.['style.css'] ?? '',
          title: `${slug} preview`,
          timings: { totalMs: 1, baseReadMs: 0, kitModulesMs: 0, audioMs: 0, musicMs: 0, bundleMs: 1 },
        }),
      } as unknown as GitHubClient;
    }

    it('503s when no githubClient is configured on this deployment', async () => {
      // Clears GITHUB_TOKEN — app.ts otherwise falls back to it silently.
      const priorToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;
      try {
        await withApp(async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/preview',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(503);
        });
      } finally {
        if (priorToken === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = priorToken;
      }
    });

    it('404s for a slug the caller does not own — never 403', async () =>
      withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/preview',
            headers: authHeaders('g:other'),
          });
          expect(res.statusCode).toBe(404);
        },
        { githubClient: stubGithubClient() },
      ));

    it('refuses once an agent round goes live — same guard stage and patch already enforce', async () =>
      withApp(
        async (app) => {
          await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/preview',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(409);
          expect(res.json()).toMatchObject({ error: 'agent_round' });
        },
        { githubClient: stubGithubClient() },
      ));

    it('refuses when nothing playable is staged yet, without touching the engine', async () => {
      const { games: withKitGames, objectStore } = storesWithKit('declare const GameKit: { boot(): void };');
      const githubClient = stubGithubClient();
      const spy = vi.spyOn(githubClient, 'getGameSources');
      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/preview',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(409);
          expect(res.json()).toMatchObject({ error: 'incomplete' });
          expect(spy).not.toHaveBeenCalled();
        },
        { objectStore, games: withKitGames, githubClient },
      );
    });

    it('builds the staged buffer and returns the document inline, in one round trip — no BuildPreview write', async () => {
      const { games: withKitGames, objectStore } = storesWithKit('declare const GameKit: { boot(): void };');
      await withKitGames.putStagedSourceFile({
        slug: 'sky-dodge',
        issueNumber: 10,
        roundGeneration: 1,
        path: 'game.ts',
        content: 'export const boot = 1;',
        stagedBy: 'owner',
      });
      await withKitGames.putStagedSourceFile({
        slug: 'sky-dodge',
        issueNumber: 10,
        roundGeneration: 1,
        path: 'GAME.json',
        // index.html is refused — howToPlay satisfies hasPlayableOverlay instead.
        content: JSON.stringify({
          engine: { modules: [] },
          howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
        }),
        stagedBy: 'owner',
      });
      await withKitGames.putStagedSourceFile({
        slug: 'sky-dodge',
        issueNumber: 10,
        roundGeneration: 1,
        path: 'style.css',
        content: '.game { color: gold; }',
        stagedBy: 'owner',
      });

      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/preview',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(200);
          const body = res.json() as { html: string; engineRef: string; timings?: { totalMs: number } };
          expect(body.engineRef).toBe(ENGINE_REF);
          expect(body.html).toContain('window.__REF__');
          expect(body.html).toContain('export const boot = 1;');
          expect(body.timings?.totalMs).toBeGreaterThanOrEqual(0);

          // No BuildPreview artifact landed — this is a synchronous read.
          expect(await store.listBuildPreviews(10)).toEqual([]);
        },
        { objectStore, games: withKitGames, githubClient: stubGithubClient() },
      );
    });
  });

  describe('GET /api/me/studio/games/:slug/sources/kit-declaration', () => {
    it('404s when no kit is published', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources/kit-declaration',
          headers: authHeaders('g:creator'),
        });
        expect(res.statusCode).toBe(404);
      }));

    it('404s for a slug the caller does not own — never 403', async () => {
      const { games: withKitGames, objectStore } = storesWithKit('declare const GameKit: { boot(): void };');
      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'GET',
            url: '/api/me/studio/games/not-mine/sources/kit-declaration',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(404);
        },
        { objectStore, games: withKitGames },
      );
    });

    it('serves the declaration text and engineRef, ETagged by ref, once a kit is published', async () => {
      const { games: withKitGames, objectStore } = storesWithKit('declare const GameKit: { boot(): void };');
      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'GET',
            url: '/api/me/studio/games/sky-dodge/sources/kit-declaration',
            headers: authHeaders('g:creator'),
          });
          expect(res.statusCode).toBe(200);
          expect(res.json()).toEqual({
            engineRef: ENGINE_REF,
            declaration: 'declare const GameKit: { boot(): void };',
          });
          expect(res.headers.etag).toBe(`"${ENGINE_REF}"`);
        },
        { objectStore, games: withKitGames },
      );
    });
  });

  describe('the base a round builds on (round-base-version.ts)', () => {
    // Delivers the three required files under round 10.
    async function deliverBase(): Promise<string> {
      await games.putCandidateSources({
        slug: 'sky-dodge',
        issueNumber: 10,
        files: [
          { path: 'SPEC.md', content: '# Sky Dodge' },
          {
            path: 'GAME.json',
            content: JSON.stringify({
              engine: { modules: [] },
              howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
            }),
          },
          { path: 'game.ts', content: 'export const boot = 1;' },
        ],
        mode: 'preview',
      });
      const version = (await games.listVersions('sky-dodge'))[0]!.version;
      await store.setSubmissionDeliveredVersion(10, version);
      return version;
    }

    it('an edit that opens a fresh round still sees the files the previous round delivered', async () =>
      withApp(async (app) => {
        await deliverBase();
        // Closed round: the next write opens a manual one.
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });

        const staged = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 2;', rebuild: false },
        });
        expect(staged.statusCode).toBe(200);
        expect(staged.json().roundOpened).toEqual(expect.any(Number));

        const listed = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(listed.statusCode).toBe(200);
        const files = listed.json().files as Array<{ path: string; content: string; base?: string }>;
        // Editing one file must not read as "the others are gone".
        expect(files.map((file) => file.path)).toEqual(['GAME.json', 'SPEC.md', 'game.ts']);
        expect(files.find((file) => file.path === 'game.ts')?.base).toBe('export const boot = 1;');
      }));

    it('delivers that edit as a whole game, not as the one file the buffer holds', async () =>
      withApp(async (app) => {
        await deliverBase();
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
        await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 2;', rebuild: false },
        });

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(200);
        const manifest = await games.getManifest('sky-dodge', res.json().version as string);
        expect([...(manifest?.sourceFiles ?? [])].sort()).toEqual(['GAME.json', 'SPEC.md', 'game.ts']);
      }));

    it('ignores an abandoned round when it looks for the base', async () =>
      withApp(async (app) => {
        const version = await deliverBase();
        await store.setSubmissionAbandoned(10, new Date().toISOString());
        await store.createSubmission(11, 'g:creator', 'Sky Dodge');
        await store.setSubmissionSlug(11, 'sky-dodge');

        const listed = await app.inject({
          method: 'GET',
          url: '/api/me/studio/games/sky-dodge/sources',
          headers: authHeaders('g:creator'),
        });
        expect(listed.statusCode).toBe(200);
        expect(listed.json().version).not.toBe(version);
        expect(listed.json().files).toEqual([]);
      }));

    it('the round it opens carries the version forward on its own record, not only via a sibling lookup', async () =>
      withApp(async (app) => {
        const version = await deliverBase();
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });

        const staged = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = 2;', rebuild: false },
        });
        const opened = await store.getSubmission(staged.json().roundOpened as number);
        expect(opened?.previewVersion).toBe(version);
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/stage/restore', () => {
    it('names the missing required file on a refused delivery, not only in the sentence', async () =>
      withApp(async (app) => {
        await games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'game.ts',
          content: 'export const boot = 1;',
          stagedBy: 'owner',
        });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ code: 'invalid_upload', missing: ['SPEC.md'] });
      }));

    it('stages the file back from the delivery that has it', async () =>
      withApp(async (app) => {
        await games.putCandidateSources({
          slug: 'sky-dodge',
          issueNumber: 10,
          files: [
            { path: 'SPEC.md', content: '# Sky Dodge\n' },
            {
              path: 'GAME.json',
              content: JSON.stringify({
                engine: { modules: [] },
                howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
              }),
            },
            { path: 'game.ts', content: 'export const boot = 1;' },
          ],
          mode: 'preview',
        });
        await store.setSubmissionDeliveredVersion(10, (await games.listVersions('sky-dodge'))[0]!.version);

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/restore',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'SPEC.md' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ accepted: true, path: 'SPEC.md', from: 'delivery' });
        const staged = await games.getStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'SPEC.md',
        });
        expect(staged).toBe('# Sky Dodge\n');
      }));

    it('builds SPEC.md from the game brief when no delivery has one', async () =>
      withApp(async (app) => {
        await store.setSubmissionBrief(10, { spec: 'Dodge falling rocks for as long as you can.', qa: [] });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/restore',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'SPEC.md' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ accepted: true, from: 'stub' });
        const staged = await games.getStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path: 'SPEC.md',
        });
        expect(staged).toContain('title: "Sky Dodge"');
        expect(staged).toContain('slug: "sky-dodge"');
        expect(staged).toContain('Dodge falling rocks for as long as you can.');
      }));

    it('refuses to invent a game.ts nobody has written', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/restore',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts' },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: 'no_source' });
      }));

    it('refuses while an agent holds the round', async () =>
      withApp(async (app) => {
        await store.recordDispatch(10, { backend: 'managed', ref: 'session-1' });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/restore',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'SPEC.md' },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ error: 'agent_round' });
      }));

    it('404s for a slug the caller does not own', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/stage/restore',
          headers: { ...authHeaders('g:other'), 'content-type': 'application/json' },
          payload: { path: 'SPEC.md' },
        });
        expect(res.statusCode).toBe(404);
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/deliver', () => {
    it('refuses without the IP attestation', async () =>
      withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview' },
        });
        expect(res.statusCode).toBe(400);
      }));

    it('refuses a game with no active round to deliver into', async () =>
      withApp(async (app) => {
        await store.recordJobTransition(10, { to: 'published', at: new Date().toISOString(), by: 'operator' });
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ error: 'no_active_round' });
      }));

    it('delivers a staged owner edit, stamping owner authorship, and enforces the cooldown', async () =>
      withApp(async (app) => {
        const stage = (path: string, content: string) =>
          games.putStagedSourceFile({
            slug: 'sky-dodge',
            issueNumber: 10,
            roundGeneration: 1,
            path,
            content,
            stagedBy: 'owner',
          });
        await stage('SPEC.md', '# Sky Dodge');
        // index.html is refused as an upload — GAME.json.howToPlay supplies markup.
        await stage(
          'GAME.json',
          JSON.stringify({
            engine: { modules: [] },
            howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
          }),
        );
        await stage('game.ts', 'export const boot = () => {};');

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { accepted: boolean; version?: string };
        expect(body.accepted).toBe(true);
        const manifest = await games.getManifest('sky-dodge', body.version!);
        expect(manifest?.authorship).toBe('owner');

        const again = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(again.statusCode).toBe(429);
      }));

    it('WebMCP/console-authored owner writes (agentAuthored) roll up to agent authorship, not owner', async () =>
      withApp(async (app) => {
        const stage = (path: string, content: string, agentAssisted?: boolean) =>
          games.putStagedSourceFile({
            slug: 'sky-dodge',
            issueNumber: 10,
            roundGeneration: 1,
            path,
            content,
            stagedBy: 'owner',
            ...(agentAssisted ? { agentAssisted: true } : {}),
          });
        await stage('SPEC.md', '# Sky Dodge', true);
        // index.html is refused as an upload — GAME.json.howToPlay supplies markup.
        await stage(
          'GAME.json',
          JSON.stringify({
            engine: { modules: [] },
            howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
          }),
          true,
        );
        await stage('game.ts', 'export const boot = () => {};', true);

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { accepted: boolean; version?: string };
        expect(body.accepted).toBe(true);
        const manifest = await games.getManifest('sky-dodge', body.version!);
        expect(manifest?.authorship).toBe('agent');
      }));

    it('the stage and patch routes stamp an agentAuthored write as owner-staged (agentAssisted, not agent)', async () =>
      withApp(async (app) => {
        const staged = await app.inject({
          method: 'PUT',
          url: '/api/me/studio/games/sky-dodge/sources/stage',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { path: 'game.ts', content: 'export const boot = () => {};', agentAuthored: true },
        });
        expect(staged.statusCode).toBe(200);

        const summary = await games.listStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1 });
        const entry = summary.files.find((f) => f.path === 'game.ts');
        expect(entry?.stagedBy).toBe('owner');
        expect(entry?.agentAssisted).toBe(true);
      }));

    it("an empty staging buffer inherits the base version's authorship, not a default of owner", async () => {
      const stageAgent = (path: string, content: string) =>
        games.putStagedSourceFile({
          slug: 'sky-dodge',
          issueNumber: 10,
          roundGeneration: 1,
          path,
          content,
          stagedBy: 'agent',
        });
      const paths = ['SPEC.md', 'GAME.json', 'game.ts'] as const;
      await stageAgent('SPEC.md', '# Sky Dodge');
      // index.html is refused as an upload — GAME.json.howToPlay supplies markup.
      await stageAgent(
        'GAME.json',
        JSON.stringify({
          engine: { modules: [] },
          howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
        }),
      );
      await stageAgent('game.ts', 'export const boot = () => {};');

      // A separate `withApp` each time — its per-slug deliver cooldown is process-local
      // to that app instance, so this does not need to wait it out between the two.
      const firstVersion = await withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(200);
        return (res.json() as { version: string }).version;
      });
      expect((await games.getManifest('sky-dodge', firstVersion))?.authorship).toBe('agent');

      // The owner discards their own staged paths (there are none) or simply never
      // staged anything this round — either way the buffer is empty, and the delivered
      // content is byte-identical to the agent-authored version above.
      await games.clearStagedSources({ slug: 'sky-dodge', issueNumber: 10, roundGeneration: 1, paths: [...paths] });

      const secondVersion = await withApp(async (app) => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'preview', attestation: true },
        });
        expect(res.statusCode).toBe(200);
        return (res.json() as { version: string }).version;
      });
      expect((await games.getManifest('sky-dodge', secondVersion))?.authorship).toBe('agent');
    });

    it('a publish-mode delivery records its own submitted transition as the creator, not the agent channel', async () =>
      withApp(async (app) => {
        const stage = (path: string, content: string) =>
          games.putStagedSourceFile({
            slug: 'sky-dodge',
            issueNumber: 10,
            roundGeneration: 1,
            path,
            content,
            stagedBy: 'owner',
          });
        await stage('SPEC.md', '# Sky Dodge');
        // index.html is refused as an upload — GAME.json.howToPlay supplies markup.
        await stage(
          'GAME.json',
          JSON.stringify({
            engine: { modules: [] },
            howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
          }),
        );
        await stage('game.ts', 'export const boot = () => {};');
        await stage('TRACE.json', '{"samples":[]}');
        await stage('PLAYTEST.json', '{"expectProgress":["round-start"]}');

        const res = await app.inject({
          method: 'POST',
          url: '/api/me/studio/games/sky-dodge/sources/deliver',
          headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
          payload: { mode: 'publish', attestation: true },
        });
        expect(res.statusCode).toBe(200);

        const record = await store.getSubmission(10);
        const submitted = record?.transitions?.find((entry) => entry.to === 'submitted');
        expect(submitted?.by).toBe('creator');
      }));
  });

  describe('POST /api/me/studio/games/:slug/sources/complete', () => {
    function withTabComplete<T>(fn: () => Promise<T>): Promise<T> {
      const prior = process.env.TAB_COMPLETE;
      process.env.TAB_COMPLETE = 'true';
      return fn().finally(() => {
        if (prior === undefined) delete process.env.TAB_COMPLETE;
        else process.env.TAB_COMPLETE = prior;
      });
    }

    it('404s when the TAB_COMPLETE kill switch is off, even with CODE_SURFACE on', async () =>
      withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/complete',
            headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
            payload: { path: 'game.ts', prefixWindow: 'const x = ', suffixWindow: ';' },
          });
          expect(res.statusCode).toBe(404);
        },
        { tabCompleter: new StubTabCompleter({ completion: '1' }) },
      ));

    it('404s for a slug the caller does not own — never 403', async () =>
      withTabComplete(() =>
        withApp(
          async (app) => {
            const res = await app.inject({
              method: 'POST',
              url: '/api/me/studio/games/sky-dodge/sources/complete',
              headers: { ...authHeaders('g:other'), 'content-type': 'application/json' },
              payload: { path: 'game.ts', prefixWindow: 'const x = ', suffixWindow: ';' },
            });
            expect(res.statusCode).toBe(404);
          },
          { tabCompleter: new StubTabCompleter({ completion: '1' }) },
        ),
      ));

    it('returns the proposal from the injected completer', async () =>
      withTabComplete(() =>
        withApp(
          async (app) => {
            const res = await app.inject({
              method: 'POST',
              url: '/api/me/studio/games/sky-dodge/sources/complete',
              headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
              payload: { path: 'game.ts', prefixWindow: 'const speed = ', suffixWindow: ';' },
            });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({ completion: '0.16' });
          },
          { tabCompleter: new StubTabCompleter({ completion: '0.16' }) },
        ),
      ));

    it('429s once the per-creator daily quota is spent', async () => {
      process.env.DAILY_TAB_COMPLETE_QUOTA = '3';
      try {
        await withTabComplete(() =>
          withApp(
            async (app) => {
              const request = () =>
                app.inject({
                  method: 'POST',
                  url: '/api/me/studio/games/sky-dodge/sources/complete',
                  headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
                  payload: { path: 'game.ts', prefixWindow: 'a', suffixWindow: 'b' },
                });
              for (let i = 0; i < 3; i += 1) {
                expect((await request()).statusCode).toBe(200);
              }
              expect((await request()).statusCode).toBe(429);
            },
            { tabCompleter: new StubTabCompleter({ completion: 'x' }) },
          ),
        );
      } finally {
        delete process.env.DAILY_TAB_COMPLETE_QUOTA;
      }
    });

    it('refuses on the global pause without spending the per-creator quota', async () =>
      withTabComplete(() =>
        withApp(
          async (app) => {
            await store.setCreationLimits({ tabCompletePaused: true }, 'operator');
            const res = await app.inject({
              method: 'POST',
              url: '/api/me/studio/games/sky-dodge/sources/complete',
              headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
              payload: { path: 'game.ts', prefixWindow: 'a', suffixWindow: 'b' },
            });
            expect(res.statusCode).toBe(503);
            // A refused global gate must leave the daily allowance untouched.
            const dateStr = new Date().toISOString().slice(0, 10);
            expect((await store.getUsage('g:creator', dateStr)).tabCompletes).toBe(0);
          },
          { tabCompleter: new StubTabCompleter({ completion: 'x' }) },
        ),
      ));
  });

  describe('POST /api/me/studio/games/:slug/sources/revert', () => {
    it('rolls forward by creating a new build from target version sources', async () => {
      const { version } = await games.putCandidateSources({
        slug: 'sky-dodge',
        issueNumber: 10,
        mode: 'preview',
        files: [
          { path: 'SPEC.md', content: '# Sky Dodge' },
          {
            path: 'GAME.json',
            content: JSON.stringify({
              engine: { modules: [] },
              howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Play', pl: 'Graj' } },
            }),
          },
          { path: 'game.ts', content: 'export function run() {}' },
        ],
      });

      const delivered: Array<{ files: SourceFile[]; mode: string; summary?: string }> = [];
      const stubSourceDelivery: SourceDeliveryService = {
        deliver: async (input) => {
          delivered.push({ files: input.files, mode: input.mode, summary: input.summary });
          return { accepted: true, slug: input.slug, version: 'v-reverted', mode: input.mode, gateStarted: true };
        },
      };

      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/revert',
            headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
            payload: { targetVersion: version, attestation: true },
          });

          expect(res.statusCode).toBe(200);
          expect(res.json()).toMatchObject({
            accepted: true,
            version: 'v-reverted',
            targetVersion: version,
          });
          expect(delivered.length).toBe(1);
          expect(delivered[0]?.files.map((f) => f.path)).toContain('game.ts');
          expect(delivered[0]).toMatchObject({
            summary: `Reverted to build ${version}`,
          });
        },
        { sourceDelivery: stubSourceDelivery },
      );
    });

    it('404s when target version does not exist', async () => {
      const stubSourceDelivery: SourceDeliveryService = {
        deliver: async () => ({ accepted: true, slug: 'sky-dodge', version: 'v2', mode: 'preview', gateStarted: true }),
      };

      await withApp(
        async (app) => {
          const res = await app.inject({
            method: 'POST',
            url: '/api/me/studio/games/sky-dodge/sources/revert',
            headers: { ...authHeaders('g:creator'), 'content-type': 'application/json' },
            payload: { targetVersion: 'v-nonexistent', attestation: true },
          });

          expect(res.statusCode).toBe(404);
        },
        { sourceDelivery: stubSourceDelivery },
      );
    });
  });
});
