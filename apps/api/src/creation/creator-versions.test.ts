import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('404s the former owner after the slug transfers', async () => {
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
    const former = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:creator'),
    });
    expect(former.statusCode).toBe(404);
    const current = await app.inject({
      method: 'GET',
      url: `/api/me/studio/games/${SLUG}/versions`,
      headers: sessionHeaders('g:other'),
    });
    expect(current.statusCode).toBe(200);
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
