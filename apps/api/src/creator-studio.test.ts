import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import type { CreatorHealthResponse, CreatorStudioGame } from './creator-studio.js';
import { InMemoryStore, type TelemetryEvent } from './store.js';
import { mintToken } from './submission-token.js';

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
    expect(res.json()).toEqual({ days: [], truncated: false, games: [] });
    await app.close();
  });
});
