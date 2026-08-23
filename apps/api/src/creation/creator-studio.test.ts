import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';
import type { CreatorHealthResponse, CreatorScorecardsResponse, CreatorStudioGame } from './creator-studio.js';
import { InMemoryStore, type Scorecard, type TelemetryEvent } from '../platform/store.js';
import { mintToken } from '../platform/submission-token.js';

const sessionSecret = 'dev-session-secret-change-me';
const submissionTokenSecret = 'test-submission-secret';

function authHeaders(uid: string) {
  return { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, sessionSecret)}` };
}

const today = new Date().toISOString().slice(0, 10);

function event(partial: Partial<TelemetryEvent> & { type: TelemetryEvent['type'] }): TelemetryEvent {
  return {
    slug: 'sky-dodge',
    sessionId: 's1',
    at: `${today}T10:00:00.000Z`,
    ...partial,
  } as TelemetryEvent;
}

describe('GET /api/me/studio', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
  });

  it('lists the creator’s games with slug and publishedAt when known', async () => {
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.setSubmissionPublishedAt(10, `${today}T12:00:00.000Z`);
    await store.setSubmissionNotifiedStatus(10, 'published');
    // Same-millisecond creates sort by createdAt string; bump the newer one explicitly.
    await new Promise((resolve) => setTimeout(resolve, 2));
    await store.createSubmission(11, 'g:creator', 'Still building');
    await store.createSubmission(12, 'g:other', 'Not mine');

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games.map((game) => game.title)).toEqual(['Still building', 'Sky Dodge']);
    expect(games[1]).toMatchObject({
      title: 'Sky Dodge',
      slug: 'sky-dodge',
      publishedAt: `${today}T12:00:00.000Z`,
      lastKnownStatus: 'published',
      token: mintToken(10, submissionTokenSecret),
    });
    expect(games[0]?.slug).toBeUndefined();

    await app.close();
  });

  it('reports a deleted game as not live while keeping its publish history', async () => {
    await store.createSubmission(20, 'g:creator', 'Comet Courier');
    await store.setSubmissionSlug(20, 'comet-courier');
    await store.setSubmissionPublishedAt(20, `${today}T12:00:00.000Z`);
    await store.setSubmissionNotifiedStatus(20, 'published');
    await store.setPublication({
      slug: 'comet-courier',
      state: 'published',
      currentVersion: 'v1',
      publishedAt: `${today}T12:00:00.000Z`,
    });
    await store.archivePublication('comet-courier', 'deleted by creator', `${today}T13:00:00.000Z`);

    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });

    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games).toHaveLength(1);
    // History stands — the row still says when it published.
    expect(games[0]).toMatchObject({ slug: 'comet-courier', publishedAt: `${today}T12:00:00.000Z`, live: false });

    await app.close();
  });

  it('reads a game with no publication record as live (games-repo entries, legacy slugs)', async () => {
    await store.createSubmission(21, 'g:creator', 'Legacy Game');
    await store.setSubmissionSlug(21, 'legacy-game');
    await store.setSubmissionPublishedAt(21, `${today}T12:00:00.000Z`);

    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });

    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games[0]?.live).toBeUndefined();

    await app.close();
  });

  it('lists all distinct games even when improvement rounds exceed the job ceiling', async () => {
    for (let game = 0; game < 3; game++) {
      const slug = `game-${game}`;
      for (let tip = 0; tip < 20; tip++) {
        const issueNumber = game * 100 + tip + 1;
        await store.createSubmission(issueNumber, 'g:creator', `Game ${game} tip ${tip}`);
        await store.setSubmissionSlug(issueNumber, slug);
        if (tip === 0) {
          await store.setSubmissionPublishedAt(issueNumber, `${today}T12:00:00.000Z`);
        }
        if (tip < 19) await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { games: CreatorStudioGame[]; truncated: boolean; totalGames: number };
    expect(body.totalGames).toBe(3);
    expect(body.truncated).toBe(false);
    expect(body.games).toHaveLength(3);
    expect(new Set(body.games.map((game) => game.slug))).toEqual(new Set(['game-0', 'game-1', 'game-2']));

    await app.close();
  });

  it('includes a specifically addressed game beyond the shelf ceiling', async () => {
    for (let game = 0; game < 51; game++) {
      const issueNumber = 1_000 + game;
      await store.createSubmission(issueNumber, 'g:creator', `Game ${game}`);
      await store.setSubmissionSlug(issueNumber, `game-${game}`);
      if (game < 50) await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const ordinary = await app.inject({
      method: 'GET',
      url: '/api/me/studio',
      headers: authHeaders('g:creator'),
    });
    const ordinaryBody = ordinary.json() as { games: CreatorStudioGame[]; truncated: boolean; totalGames: number };
    expect(ordinaryBody.games).toHaveLength(50);
    expect(ordinaryBody.games.map((game) => game.slug)).not.toContain('game-0');

    const addressed = await app.inject({
      method: 'GET',
      url: '/api/me/studio?game=game-0',
      headers: authHeaders('g:creator'),
    });
    const addressedBody = addressed.json() as { games: CreatorStudioGame[]; truncated: boolean; totalGames: number };
    expect(addressedBody).toMatchObject({ truncated: true, totalGames: 51 });
    expect(addressedBody.games).toHaveLength(51);
    expect(addressedBody.games.map((game) => game.slug)).toContain('game-0');

    await app.close();
  });

  it('prefers lastStatus over lastNotifiedStatus so a just-published game is not still "building"', async () => {
    // `in_review` shares a notification event with `building`, so lastNotifiedStatus
    // can lag while lastStatus is current — and publish writes lastStatus immediately.
    await store.createSubmission(20, 'g:creator', 'Just shipped');
    await store.setSubmissionSlug(20, 'just-shipped');
    await store.setSubmissionPublishedAt(20, `${today}T12:00:00.000Z`);
    await store.setSubmissionNotifiedStatus(20, 'building');
    await store.setSubmissionLastStatus(20, 'published');

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { games: CreatorStudioGame[] }).games[0]).toMatchObject({
      title: 'Just shipped',
      lastKnownStatus: 'published',
    });

    await app.close();
  });

  it('requires a session', async () => {
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('hides abandoned and operator-canceled games from the shelf', async () => {
    await store.createSubmission(10, 'g:creator', 'Keep me');
    await store.createSubmission(11, 'g:creator', 'Creator stopped');
    await store.setSubmissionAbandoned(11, `${today}T12:00:00.000Z`);
    await store.createSubmission(12, 'g:creator', 'Operator rejected');
    // Pre-fix shape: cancel wrote state but not abandonedAt — still must not shelf.
    await store.recordJobTransition(12, {
      to: 'canceled',
      at: `${today}T12:00:00.000Z`,
      by: 'operator',
      reason: 'operator_canceled',
    });

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games.map((game) => game.title)).toEqual(['Keep me']);

    await app.close();
  });

  function stubGamesStore(sourceFilesByVersion: Record<string, string[]>) {
    return {
      getManifest: async (_slug: string, version: string) =>
        sourceFilesByVersion[version]
          ? {
              slug: 'sky-dodge',
              version,
              createdAt: today,
              issueNumber: 10,
              sourceFiles: sourceFilesByVersion[version],
            }
          : null,
    } as unknown as import('../delivery/games-store.js').GamesStore;
  }

  it('is editable off a mode=preview build mid-round, before anything is delivered', async () => {
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.setSubmissionPreviewVersion(10, 'v1');

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret,
        agentChannel: { gamesStore: stubGamesStore({ v1: ['GAME.json', 'EDITOR.json', 'game.ts'] }) },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });
    expect(res.statusCode).toBe(200);
    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games[0]).toMatchObject({ slug: 'sky-dodge', editable: true });

    await app.close();
  });

  it('prefers the newer preview build over an older delivered one for the editable check', async () => {
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.setSubmissionDeliveredVersion(10, 'v1'); // no EDITOR.json
    await store.setSubmissionPreviewVersion(10, 'v2'); // ships one

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret,
        agentChannel: {
          gamesStore: stubGamesStore({
            v1: ['GAME.json', 'game.ts'],
            v2: ['GAME.json', 'EDITOR.json', 'game.ts'],
          }),
        },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });
    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games[0]).toMatchObject({ slug: 'sky-dodge', editable: true });

    await app.close();
  });

  it('leaves editable unset when neither the preview nor the delivered build ships an editor', async () => {
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.setSubmissionPreviewVersion(10, 'v1');

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: {
        submissionTokenSecret,
        agentChannel: { gamesStore: stubGamesStore({ v1: ['GAME.json', 'game.ts'] }) },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio', headers: authHeaders('g:creator') });
    const games = (res.json() as { games: CreatorStudioGame[] }).games;
    expect(games[0]?.editable).toBeUndefined();

    await app.close();
  });
});

describe('GET /api/me/studio/health', () => {
  let store: InMemoryStore;

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
  });

  it('summarizes play only for the creator’s own published slugs', async () => {
    await store.createSubmission(10, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(10, 'sky-dodge');
    await store.setSubmissionPublishedAt(10, `${today}T12:00:00.000Z`);
    // Draft-only slug must not appear in the published scorecard.
    await store.createSubmission(11, 'g:creator', 'Still drafting');
    await store.setSubmissionSlug(11, 'still-drafting');
    await store.appendTelemetryEvents(today, [
      event({ type: 'game_opened', msSinceOpen: 0 }),
      event({ type: 'play_time', seconds: 20, msSinceOpen: 20_000, at: `${today}T10:00:20.000Z` }),
      event({
        type: 'game_opened',
        slug: 'someone-elses-game',
        sessionId: 's2',
        msSinceOpen: 0,
      }),
      event({
        type: 'play_time',
        slug: 'someone-elses-game',
        sessionId: 's2',
        seconds: 99,
        msSinceOpen: 20_000,
        at: `${today}T10:00:20.000Z`,
      }),
      event({
        type: 'game_opened',
        slug: 'still-drafting',
        sessionId: 's3',
        msSinceOpen: 0,
      }),
      event({
        type: 'play_time',
        slug: 'still-drafting',
        sessionId: 's3',
        seconds: 40,
        msSinceOpen: 20_000,
        at: `${today}T10:00:20.000Z`,
      }),
    ]);

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio/health?days=1',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as CreatorHealthResponse;
    expect(body.games).toHaveLength(1);
    expect(body.games[0]).toMatchObject({
      slug: 'sky-dodge',
      sessions: 1,
      totalPlaySeconds: 20,
    });

    await app.close();
  });

  it('returns an empty shelf when the creator has no slugged games', async () => {
    await store.createSubmission(10, 'g:creator', 'No slug yet');
    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio/health',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ days: [], truncated: false, gamesTruncated: false, totalGames: 0, games: [] });
    await app.close();
  });

  it('lists all distinct published games even when improvement rounds exceed the job ceiling', async () => {
    for (let game = 0; game < 3; game++) {
      const slug = `game-${game}`;
      for (let tip = 0; tip < 20; tip++) {
        const issueNumber = game * 100 + tip + 1;
        await store.createSubmission(issueNumber, 'g:creator', `Game ${game} tip ${tip}`);
        await store.setSubmissionSlug(issueNumber, slug);
        if (tip === 0) {
          await store.setSubmissionPublishedAt(issueNumber, `${today}T12:00:00.000Z`);
        }
        if (tip < 19) await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    const app = await buildApp({
      store,
      sessionSecret,
      submissionRoutes: { submissionTokenSecret },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/me/studio/health?days=1',
      headers: authHeaders('g:creator'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as CreatorHealthResponse;
    expect(body.totalGames).toBe(3);
    expect(body.gamesTruncated).toBe(false);

    await app.close();
  });
});

describe('GET /api/me/studio/scorecards', () => {
  let store: InMemoryStore;

  /** A scorecard carrying only the fields this route reads. */
  function card(slug: string, partial: Partial<Scorecard> = {}): Scorecard {
    return {
      slug,
      computedAt: `${today}T03:00:00.000Z`,
      window: { days: [today, '2026-07-26'], truncated: false },
      sessions: { count: 9, bounces: 1, closes: 5, medianPlaySeconds: 30, totalPlaySeconds: 300 },
      health: { errors: 0, aliveTicks: 0, stalledTicks: 0, stallRate: 0, medianFps: 60, resumeTicksIgnored: 0 },
      depth: {
        outcomes: { won: 1, lost: 2, quit: 0 },
        sessionsWithEnding: 3,
        finishRate: 0.3,
        winRate: 0.33,
        medianBestScore: 40,
      },
      votes: { up: 4, down: 1 },
      feedback: { count: 3 },
      untrusted: { errorSamples: [], progressLabels: [], feedbackThemes: [{ theme: 'level 2 is a wall', count: 3 }] },
      ...partial,
    } as Scorecard;
  }

  beforeEach(async () => {
    store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:creator' });
    await store.createSubmission(20, 'g:creator', 'Sky Dodge');
    await store.setSubmissionSlug(20, 'sky-dodge');
    await store.setSubmissionPublishedAt(20, `${today}T12:00:00.000Z`);
  });

  async function get(uid = 'g:creator') {
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio/scorecards', headers: authHeaders(uid) });
    await app.close();
    return res;
  }

  it('returns votes, note count and themes for the creator’s own game', async () => {
    await store.putScorecard('sky-dodge', card('sky-dodge'));

    const res = await get();

    expect(res.statusCode).toBe(200);
    const body = res.json() as CreatorScorecardsResponse;
    expect(body.scorecards).toEqual([
      {
        slug: 'sky-dodge',
        computedAt: `${today}T03:00:00.000Z`,
        windowDays: 2,
        truncated: false,
        votes: { up: 4, down: 1 },
        feedbackCount: 3,
        untrustedThemes: [{ theme: 'level 2 is a wall', count: 3 }],
      },
    ]);
  });

  it('does not return session counts that would contradict the health route', async () => {
    // The health route recomputes over a window the creator picks; a scorecard is a fixed
    // roll. Two numbers labelled "sessions" disagreeing on one screen is the bug this
    // response shape exists to prevent.
    //
    // Asserted as an exact key set rather than by searching the serialized body: themes are
    // player-written text, so a player who writes "too many sessions" would otherwise fail
    // this test against a route that is behaving perfectly.
    await store.putScorecard(
      'sky-dodge',
      card('sky-dodge', {
        untrusted: {
          errorSamples: [],
          progressLabels: [],
          feedbackThemes: [{ theme: 'too many sessions before the finishRate improves', count: 3 }],
        },
      }),
    );

    const body = (await get()).json() as CreatorScorecardsResponse;

    expect(Object.keys(body.scorecards[0]).sort()).toEqual([
      'computedAt',
      'feedbackCount',
      'slug',
      'truncated',
      'untrustedThemes',
      'votes',
      'windowDays',
    ]);
  });

  it('omits a game with no scorecard rather than reporting zeros', async () => {
    const body = (await get()).json() as CreatorScorecardsResponse;

    // Not measured is not the same as measured and found empty.
    expect(body.scorecards).toEqual([]);
  });

  it('never returns another creator’s game', async () => {
    await store.upsertUser({ uid: 'g:other' });
    await store.createSubmission(21, 'g:other', 'Not Mine');
    await store.setSubmissionSlug(21, 'not-mine');
    await store.setSubmissionPublishedAt(21, `${today}T12:00:00.000Z`);
    await store.putScorecard('not-mine', card('not-mine'));
    await store.putScorecard('sky-dodge', card('sky-dodge'));

    const body = (await get()).json() as CreatorScorecardsResponse;

    expect(body.scorecards.map((entry) => entry.slug)).toEqual(['sky-dodge']);
  });

  it('leaves out an unpublished game even when a scorecard somehow exists', async () => {
    await store.createSubmission(22, 'g:creator', 'Draft');
    await store.setSubmissionSlug(22, 'draft-game');
    await store.putScorecard('draft-game', card('draft-game'));
    await store.putScorecard('sky-dodge', card('sky-dodge'));

    const body = (await get()).json() as CreatorScorecardsResponse;

    expect(body.scorecards.map((entry) => entry.slug)).toEqual(['sky-dodge']);
  });

  it('carries themes under a name that says they are untrusted', async () => {
    // The field name is part of the defence: a caller reaching for `untrustedThemes` has
    // been told what it is holding, the same way `card.untrusted` does server-side.
    await store.putScorecard('sky-dodge', card('sky-dodge'));

    const body = (await get()).json() as CreatorScorecardsResponse;

    expect(Object.keys(body.scorecards[0])).toContain('untrustedThemes');
  });

  it('requires a signed-in creator', async () => {
    const app = await buildApp({ store, sessionSecret, submissionRoutes: { submissionTokenSecret } });
    const res = await app.inject({ method: 'GET', url: '/api/me/studio/scorecards' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  describe('GET /api/me/studio/games/:slug/builds', () => {
    it('returns paged build history with manifests and total count', async () => {
      await store.createSubmission(10, 'g:creator', 'Sky Dodge');
      await store.setSubmissionSlug(10, 'sky-dodge');

      const manifests = [
        {
          slug: 'sky-dodge',
          version: 'v2',
          createdAt: `${today}T12:00:00.000Z`,
          issueNumber: 10,
          deliveryMode: 'publish' as const,
          sourceFiles: ['game.ts', 'GAME.json'],
          gate: { green: true, ranAt: `${today}T12:05:00.000Z` },
          summary: 'Added sound',
        },
        {
          slug: 'sky-dodge',
          version: 'v1',
          createdAt: `${today}T11:00:00.000Z`,
          issueNumber: 10,
          deliveryMode: 'preview' as const,
          sourceFiles: ['game.ts'],
          previewGate: { green: true, ranAt: `${today}T11:02:00.000Z` },
          summary: 'Initial draft',
        },
      ];

      const gamesStore = {
        listVersions: async () => manifests,
        countVersions: async () => 2,
      } as unknown as import('../delivery/games-store.js').GamesStore;

      const app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: { submissionTokenSecret, agentChannel: { gamesStore } },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/me/studio/games/sky-dodge/builds',
        headers: authHeaders('g:creator'),
      });

      expect(res.statusCode).toBe(200);
      const data = res.json() as import('@gamedevpl/contract').StudioBuildsResponse;
      expect(data.totalCount).toBe(2);
      expect(data.builds.length).toBe(2);
      expect(data.builds[0]).toMatchObject({
        version: 'v2',
        verdict: 'green',
        summary: 'Added sound',
        fileCount: 2,
      });

      await app.close();
    });

    it('fills missing changelogs from the round done event', async () => {
      await store.createSubmission(10, 'g:creator', 'Sky Dodge');
      await store.setSubmissionSlug(10, 'sky-dodge');
      await store.setSubmissionLocale(10, 'pl');
      await store.appendBuildEvent(10, {
        kind: 'done',
        text: 'Added a shield pickup.',
        textLocalized: 'Dodałem tarczę.',
        locale: 'pl',
        createdAt: `${today}T12:10:00.000Z`,
      });

      const gamesStore = {
        listVersions: async () => [
          {
            slug: 'sky-dodge',
            version: 'v2',
            createdAt: `${today}T12:00:00.000Z`,
            issueNumber: 10,
            deliveryMode: 'publish' as const,
            sourceFiles: ['game.ts'],
            gate: { green: true, ranAt: `${today}T12:05:00.000Z` },
          },
        ],
        countVersions: async () => 1,
      } as unknown as import('../delivery/games-store.js').GamesStore;

      const app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: { submissionTokenSecret, agentChannel: { gamesStore } },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/me/studio/games/sky-dodge/builds?locale=pl',
        headers: authHeaders('g:creator'),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().builds[0]).toMatchObject({
        version: 'v2',
        summary: 'Dodałem tarczę.',
      });

      await app.close();
    });

    it('404s when game is not owned by user', async () => {
      const app = await buildApp({
        store,
        sessionSecret,
        submissionRoutes: {
          submissionTokenSecret,
          agentChannel: {
            gamesStore: {
              listVersions: async () => [],
            } as unknown as import('../delivery/games-store.js').GamesStore,
          },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/me/studio/games/not-owned/builds',
        headers: authHeaders('g:creator'),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
