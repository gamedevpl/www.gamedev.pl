import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GamesStore, VersionManifest } from '../delivery/games-store.js';
import { enableCliSurface, mintCreatorTokens } from '../platform/oauth-cli-test-app.js';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import { InMemoryStore, type SubmissionRecord } from '../platform/store.js';

const sessionSecret = 'dev-session-secret-change-me';
const SLUG = 'comet-courier';
const VERSION = 'v-1';

function sessionHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

const SOURCES: Record<string, string> = {
  'SPEC.md': '---\nslug: comet-courier\n---\n',
  'game.ts': 'export const speed = 3;\n',
};

function setCreatedAt(store: InMemoryStore, jobId: number, createdAt: string): void {
  const map = (store as unknown as { submissions: Map<number, SubmissionRecord> }).submissions;
  const sub = map.get(jobId);
  if (!sub) throw new Error(`no submission ${jobId}`);
  map.set(jobId, { ...sub, createdAt });
}

function stubGamesStore(): GamesStore {
  const manifest = {
    slug: SLUG,
    version: VERSION,
    createdAt: '2026-08-01T00:00:00.000Z',
    jobId: 42,
    sourceFiles: Object.keys(SOURCES),
    deliveryMode: 'preview',
  } as VersionManifest;
  return {
    listVersions: async (slug: string) => (slug === SLUG ? [manifest] : []),
    getManifest: async (slug: string, version: string) => (slug === SLUG && version === VERSION ? manifest : null),
    getSourceFile: async (_slug: string, _version: string, path: string) => SOURCES[path] ?? null,
  } as unknown as GamesStore;
}

describe('owner version history (CL-29a)', () => {
  let store: InMemoryStore;
  let restore: () => void;

  beforeEach(async () => {
    restore = enableCliSurface();
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(42, 'g:creator', 'Comet Courier');
    await store.setSubmissionSlug(42, SLUG);
  });

  afterEach(() => {
    restore();
  });

  it('lists versions and the tree for the owner, and 404s a stranger', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret: 'secret',
        agentChannel: { gamesStore: stubGamesStore() },
      },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:creator'),
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().versions[0].version).toBe(VERSION);
    expect(list.json().versions[0].sourceFiles).toEqual(Object.keys(SOURCES));

    const tree = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions/${VERSION}/tree`,
      headers: sessionHeaders('g:creator'),
    });
    expect(tree.statusCode).toBe(200);
    expect(tree.json().files).toEqual(Object.entries(SOURCES).map(([path, content]) => ({ path, content })));

    await store.upsertUser({ uid: 'g:other' });
    const stolen = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:other'),
    });
    expect(stolen.statusCode).toBe(404);
  });

  it('pages version metadata with a cursor and never returns gated authorship markings', async () => {
    const gamesStore = stubGamesStore();
    const versions = Array.from({ length: 125 }, (_, i) => ({
      version: `v${String(125 - i).padStart(4, '0')}`,
      createdAt: '2026-10-01T00:00:00Z',
      jobId: 42,
      slug: SLUG,
      sourceFiles: ['game.ts'],
      summary: 'Improved controls',
      backend: 'self',
      model: 'test-model',
      authorship: 'agent',
      deliveryMode: 'preview',
      previewGate: { green: false, ranAt: '2026-10-01T00:00:01Z' },
    })) as VersionManifest[];
    gamesStore.listVersions = async (_slug, options) =>
      versions.filter((row) => !options?.before || row.version < options.before).slice(0, options?.limit);
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret: 'secret', agentChannel: { gamesStore } },
    });
    const first = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:creator'),
    });
    expect(first.json().versions).toHaveLength(100);
    expect(first.json()).toMatchObject({ hasMore: true, nextCursor: 'v0026' });
    expect(first.json().versions[0]).toMatchObject({
      summary: 'Improved controls',
      verdict: 'failed',
      model: 'test-model',
    });
    expect(first.json().versions[0]).not.toHaveProperty('authorship');
    const next = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions?cursor=v0026`,
      headers: sessionHeaders('g:creator'),
    });
    expect(next.json().versions).toHaveLength(25);
    expect(next.json()).toMatchObject({ hasMore: false, nextCursor: null });
    for (const query of ['limit=0', 'limit=101', 'cursor=../evil']) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/me/studio/games/${SLUG}/versions?${query}`,
            headers: sessionHeaders('g:creator'),
          })
        ).statusCode,
      ).toBe(400);
    }
    await app.close();
  });

  it('serves binary bytes with their encoding, supports single-file history and refuses incomplete trees', async () => {
    const gamesStore = stubGamesStore();
    const original = (await gamesStore.getManifest(SLUG, VERSION))!;
    gamesStore.getManifest = async () => ({ ...original, sourceFiles: ['game.ts', 'images/test.png'] });
    gamesStore.getSourceFile = vi.fn(async (_slug, _version, path) =>
      path.endsWith('.png') ? Buffer.from([0, 255, 10]).toString('base64') : SOURCES[path]!,
    );
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret: 'secret', agentChannel: { gamesStore } },
    });
    const url = `/api/me/studio/games/${SLUG}/versions/${VERSION}/tree`;
    const tree = await app.inject({ method: 'GET', url, headers: sessionHeaders('g:creator') });
    expect(tree.json().files[1]).toMatchObject({ path: 'images/test.png', encoding: 'base64', content: 'AP8K' });
    expect(tree.json().metadata).toMatchObject({ version: VERSION, verdict: 'pending' });
    vi.mocked(gamesStore.getSourceFile).mockClear();
    const file = await app.inject({ method: 'GET', url: `${url}?path=game.ts`, headers: sessionHeaders('g:creator') });
    expect(file.json().files).toHaveLength(1);
    expect(gamesStore.getSourceFile).toHaveBeenCalledTimes(1);
    expect(
      (await app.inject({ method: 'GET', url: `${url}?path=../secret`, headers: sessionHeaders('g:creator') }))
        .statusCode,
    ).toBe(400);
    gamesStore.getSourceFile = async () => null;
    expect((await app.inject({ method: 'GET', url, headers: sessionHeaders('g:creator') })).statusCode).toBe(502);
    await app.close();
  });

  it('a later submission naming the same slug does not silently move ownership', async () => {
    // A stray same-slug submission must not read as a transfer.
    await store.upsertUser({ uid: 'g:other' });
    await store.createSubmission(99, 'g:other', 'Taken');
    await store.setSubmissionSlug(99, SLUG);
    setCreatedAt(store, 42, '2026-08-01T00:00:00.000Z');
    setCreatedAt(store, 99, '2026-09-01T00:00:00.000Z');
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret: 'secret',
        agentChannel: { gamesStore: stubGamesStore() },
      },
    });
    const original = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:creator'),
    });
    expect(original.statusCode).toBe(200);
    const stranger = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:other'),
    });
    expect(stranger.statusCode).toBe(404);
  });

  it('refuses version reads from a blocked owner', async () => {
    await store.upsertUser({ uid: 'g:creator', tier: 'blocked' });
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret: 'secret',
        agentChannel: { gamesStore: stubGamesStore() },
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:creator'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('authenticates a creator-scoped OAuth token the same way as a session', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        githubClient: { createIssue: async () => ({ number: 42 }) } as never,
        githubToken: 'gh-token',
        submissionTokenSecret: 'oauth-cli-mcp-secret',
        agentChannel: { gamesStore: stubGamesStore() },
      },
    });
    const tokens = await mintCreatorTokens(app, { uid: 'g:creator' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().versions).toHaveLength(1);
  });
});
