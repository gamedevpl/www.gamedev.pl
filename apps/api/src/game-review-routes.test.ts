import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { InMemoryStore } from './store.js';

const sessionSecret = 'dev-session-secret-change-me';

function authCookie(uid: string): string {
  return `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}`;
}

const LIVE_SOURCES: Record<string, string> = {
  'SPEC.md': '---\ntitle: Neon Courier\n---\n\nDeliver packages.',
  'game.ts': 'const speed = 1;\nconst grip = 2;\nrun();',
};

const CANDIDATE_SOURCES: Record<string, string> = {
  'SPEC.md': '---\ntitle: Neon Courier\n---\n\nDeliver packages.',
  // One line changed, one added.
  'game.ts': 'const speed = 1;\nconst grip = 3;\nconst rain = true;\nrun();',
  'wet.ts': 'export const wet = 1;',
};

function manifest(version: string, files: string[], gate?: VersionManifest['gate']): VersionManifest {
  return {
    slug: 'neon-courier',
    version,
    createdAt: version === 'v-live' ? '2026-08-01T12:00:00.000Z' : '2026-08-04T12:00:00.000Z',
    issueNumber: version === 'v-live' ? 1_000_001 : 1_000_002,
    sourceFiles: files,
    ...(gate ? { gate } : {}),
  };
}

function reviewGamesStore(overrides: Partial<GamesStore> = {}): GamesStore {
  const trees: Record<string, Record<string, string>> = {
    'v-live': LIVE_SOURCES,
    'v-candidate': CANDIDATE_SOURCES,
  };
  return {
    getSourceFile: async (_slug: string, version: string, path: string) => trees[version]?.[path] ?? null,
    getManifest: async (_slug: string, version: string) =>
      version === 'v-live'
        ? manifest('v-live', Object.keys(LIVE_SOURCES))
        : version === 'v-candidate'
          ? manifest('v-candidate', Object.keys(CANDIDATE_SOURCES), {
              green: true,
              ranAt: '2026-08-04T12:05:00.000Z',
              report: '31 checks passed',
            })
          : null,
    getDerivedArtifact: async (_slug: string, version: string, name: string) =>
      name === 'bundle.html' && version === 'v-candidate' ? Buffer.from('<html>candidate</html>') : null,
    ...overrides,
  } as unknown as GamesStore;
}

/** A published game plus a delivered, gate-green candidate awaiting review. */
async function seedReview(store: InMemoryStore): Promise<void> {
  await store.upsertUser({ uid: 'g:creator' });
  await store.claimHandle('g:creator', 'nightshift', '2026-07-01T00:00:00.000Z');
  await store.upsertUser({ uid: 'g:stranger' });
  await store.upsertUser({ uid: 'g:operator' });

  await store.createSubmission(1_000_001, 'g:creator', 'Neon Courier');
  await store.setSubmissionSlug(1_000_001, 'neon-courier');
  await store.setSubmissionPublishedAt(1_000_001, '2026-08-01T12:00:00.000Z');
  await store.setPublication({
    slug: 'neon-courier',
    state: 'published',
    currentVersion: 'v-live',
    publishedAt: '2026-08-01T12:00:00.000Z',
  });

  await store.createSubmission(1_000_002, 'g:creator', 'Grip on wet asphalt');
  await store.setSubmissionSlug(1_000_002, 'neon-courier');
  await store.setSubmissionDeliveredVersion(1_000_002, 'v-candidate');
  await store.recordJobTransition(1_000_002, { to: 'queued', by: 'creator' });
  await store.recordJobTransition(1_000_002, { to: 'dispatched', by: 'platform' });
  await store.recordJobTransition(1_000_002, { to: 'building', by: 'agent' });
  await store.recordJobTransition(1_000_002, { to: 'submitted', by: 'agent', reason: 'sources_delivered' });
  await store.recordJobTransition(1_000_002, { to: 'ready_for_review', by: 'platform', reason: 'gate_green' });
}

describe('game review routes', () => {
  const apps: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });

  async function appWith(store: InMemoryStore, gamesStore?: GamesStore) {
    const app = await buildApp({
      store,
      sessionSecret,
      adminUids: 'g:operator',
      submissionRoutes: gamesStore ? { agentChannel: { gamesStore } } : undefined,
    });
    apps.push(app);
    return app;
  }

  it('offers the owner both halves of the comparison, the gate verdict and the diff', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const app = await appWith(store, reviewGamesStore());

    const response = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review',
      headers: { cookie: authCookie('g:creator') },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.baselineVersion).toBe('v-live');
    expect(body.candidate).toMatchObject({
      version: 'v-candidate',
      jobId: 1_000_002,
      title: 'Grip on wet asphalt',
      gate: { green: true, report: '31 checks passed' },
    });
    expect(body.candidate.approvedAt).toBeUndefined();
    // The footnote: one file edited, one added, SPEC untouched and therefore absent.
    expect(body.diff).toMatchObject({ filesChanged: 2, added: 3, removed: 1, truncated: false });
    expect(body.diff.files.map((file: { path: string }) => file.path)).toEqual(['game.ts', 'wet.ts']);
  });

  it('serves the candidate bundle to the owner and to nobody else', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const app = await appWith(store, reviewGamesStore());

    const owner = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review/v-candidate',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json()).toEqual({
      slug: 'neon-courier',
      title: 'Grip on wet asphalt',
      html: '<html>candidate</html>',
    });

    // Unreviewed output is not public, and "not yours" reads as "not there".
    const stranger = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review/v-candidate',
      headers: { cookie: authCookie('g:stranger') },
    });
    expect(stranger.statusCode).toBe(404);

    const anonymous = await app.inject({ method: 'GET', url: '/api/games/neon-courier/review/v-candidate' });
    expect(anonymous.statusCode).toBe(401);

    // A version id the viewer's own candidate does not name is not readable either.
    const otherVersion = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review/v-live',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(otherVersion.statusCode).toBe(404);
  });

  it('records a sign-off without publishing anything', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const app = await appWith(store, reviewGamesStore());

    const approve = await app.inject({
      method: 'POST',
      url: '/api/games/neon-courier/review/v-candidate/approve',
      headers: { cookie: authCookie('g:creator') },
    });

    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ ok: true, version: 'v-candidate' });

    // The sign-off is recorded on the job...
    const record = await store.getSubmission(1_000_002);
    expect(record?.reviewApproval).toMatchObject({ version: 'v-candidate', by: 'g:creator' });
    // ...and the game that is live has not moved. Publishing stays the operator action.
    const publication = await store.getPublication('neon-courier');
    expect(publication?.currentVersion).toBe('v-live');
    expect(record?.publishedAt).toBeUndefined();
    expect(record?.state).toBe('ready_for_review');

    const after = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(after.json().candidate.approvedAt).toEqual(expect.any(String));
  });

  it('refuses a sign-off on a candidate the gate did not pass', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const redGate = reviewGamesStore({
      getManifest: async (_slug: string, version: string) =>
        version === 'v-candidate'
          ? manifest('v-candidate', Object.keys(CANDIDATE_SOURCES), {
              green: false,
              ranAt: '2026-08-04T12:05:00.000Z',
              report: '2 checks failed',
            })
          : manifest('v-live', Object.keys(LIVE_SOURCES)),
    });
    const app = await appWith(store, redGate);

    const approve = await app.inject({
      method: 'POST',
      url: '/api/games/neon-courier/review/v-candidate/approve',
      headers: { cookie: authCookie('g:creator') },
    });

    expect(approve.statusCode).toBe(409);
    expect(approve.json()).toEqual({ error: 'gate_red' });
    // A red candidate is still readable — you may look at what failed.
    const review = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(review.json().candidate.gate).toMatchObject({ green: false, report: '2 checks failed' });
  });

  it('lets an operator review any game, and reports nothing when no candidate waits', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const app = await appWith(store, reviewGamesStore());

    const operator = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review',
      headers: { cookie: authCookie('g:operator') },
    });
    expect(operator.json()).toMatchObject({ viewerIsOperator: true, candidate: { version: 'v-candidate' } });

    // Once that job publishes, there is nothing under review any more.
    await store.setSubmissionPublishedAt(1_000_002, '2026-08-05T00:00:00.000Z');
    const settled = await app.inject({
      method: 'GET',
      url: '/api/games/neon-courier/review',
      headers: { cookie: authCookie('g:creator') },
    });
    expect(settled.json()).toMatchObject({ candidate: null, diff: null, baselineVersion: 'v-live' });
  });

  it('404s a stranger and 401s an anonymous visitor on the review itself', async () => {
    const store = new InMemoryStore();
    await seedReview(store);
    const app = await appWith(store, reviewGamesStore());

    expect((await app.inject({ method: 'GET', url: '/api/games/neon-courier/review' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/games/neon-courier/review',
          headers: { cookie: authCookie('g:stranger') },
        })
      ).statusCode,
    ).toBe(404);
  });
});
