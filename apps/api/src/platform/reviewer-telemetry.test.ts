import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore, type TelemetryEvent } from './store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from './auth.js';
import { createPublishedSlugGate } from '../catalog/published-slugs.js';
import { summarizeFramePerformance } from './frame-performance.js';
import { summarizeGameHealth } from './telemetry-health.js';
import { buildDailyAggregate } from './telemetry-daily.js';
import { summarizeVisitFunnel } from '../telemetry/visit-funnel.js';
import { summarizeVisitDay } from '../telemetry/telemetry-trends.js';

const secret = 'dev-session-secret-change-me';
const sessionId = '00000000-0000-4000-8000-000000000123';
const date = new Date().toISOString().slice(0, 10);
const headers = (uid: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, secret)}` });
const performance = {
  version: 1 as const,
  source: 'raf' as const,
  valid: true,
  elapsedMs: 5000,
  intervals: [300, 0, 0, 0, 0, 0, 0, 0],
  maxGapMs: 17,
  viewportWidth: 640,
  viewportHeight: 400,
  canvasWidth: 640,
  canvasHeight: 400,
  canvasCssWidth: 640,
  canvasCssHeight: 400,
  dpr: 1,
  orientation: 'landscape' as const,
  state: 'playing' as const,
};
const row = (id: string, extra: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  slug: 'space-hop',
  sessionId: id,
  type: 'alive',
  at: `${date}T10:00:00Z`,
  frames: 300,
  performance,
  ...extra,
});

describe('reviewer telemetry cohorts', () => {
  it('derives role on every batch and ignores forged reviewer claims in both streams', async () => {
    const store = new InMemoryStore();
    for (const uid of ['g:boss', 'g:reviewer', 'g:player']) await store.upsertUser({ uid });
    const app = await buildApp({
      store,
      sessionSecret: secret,
      adminUids: 'g:boss',
      reviewerUids: 'g:reviewer',
      telemetryRoutes: {
        publishedSlugs: createPublishedSlugGate({
          client: { getCatalog: async () => [{ slug: 'space-hop', status: 'published' }] as never },
        }),
      },
    });
    try {
      for (const uid of ['g:boss', 'g:reviewer', 'g:player']) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/telemetry',
          headers: headers(uid),
          payload: {
            slug: 'space-hop',
            sessionId,
            reviewer: uid === 'g:player',
            events: [
              { type: 'game_opened', reviewer: uid === 'g:player' },
              { type: 'alive', frames: 300, performance, agentMode: true, reviewer: false },
            ],
          },
        });
        expect(res.statusCode).toBe(202);
        const visit = await app.inject({
          method: 'POST',
          url: '/api/telemetry/visit',
          headers: headers(uid),
          payload: {
            visitId: sessionId,
            flushMsSinceStart: 0,
            events: [{ type: 'visit_started', entry: 'home', msSinceStart: 0, reviewer: uid === 'g:player' }],
          },
        });
        expect(visit.statusCode).toBe(202);
      }
      const plays = await store.listTelemetryEvents(date);
      expect(plays.map((e) => e.reviewer ?? false)).toEqual([true, true, true, true, false, false]);
      expect(plays.filter((e) => e.type === 'alive').every((e) => e.agentMode === true)).toBe(true);
      expect((await store.listVisitEvents(date)).map((e) => e.reviewer ?? false)).toEqual([true, true, false]);
      expect(JSON.stringify(plays)).not.toMatch(/g:boss|g:reviewer|g:player/);
    } finally {
      await app.close();
    }
  });

  it('keeps reviewer frames available to queries without mixing cohorts or synthetic windows', () => {
    const events = [
      row('player'),
      row('reviewer', { reviewer: true }),
      row('agent', { reviewer: true, agentMode: true }),
      row('reviewer', { reviewer: true, agentMode: true }),
      row('reviewer', { reviewer: true }),
    ];
    const report = summarizeFramePerformance(events);
    expect(report.measuredSessions).toBe(2);
    expect(report.groups.map((g) => [g.reviewer, g.windows])).toEqual([
      [false, 1],
      [true, 2],
    ]);
    expect(summarizeFramePerformance(events, 'exclude').groups.map((g) => g.reviewer)).toEqual([false]);
    expect(summarizeFramePerformance(events, 'only').groups.map((g) => g.reviewer)).toEqual([true]);
    expect(summarizeGameHealth(events).map((g) => g.aliveTicks)).toEqual([1]);
    expect(buildDailyAggregate(date, events, { computedAt: 'now', sealed: true, truncated: false }).games).toHaveLength(
      1,
    );
    const visits = [
      { visitId: 'player', type: 'visit_started' as const, at: `${date}T10:00:00Z`, entry: 'home' },
      { visitId: 'review', type: 'visit_started' as const, at: `${date}T10:00:00Z`, entry: 'home' },
      { visitId: 'review', type: 'play_started' as const, at: `${date}T10:00:01Z`, reviewer: true },
    ];
    expect(summarizeVisitFunnel(visits).visits).toBe(1);
    expect(summarizeVisitFunnel(visits).plays).toBe(0);
    expect(summarizeVisitDay(date, visits).activity.visits).toBe(1);
  });

  it('retains opening device/build context after leaving agent mode', () => {
    const report = summarizeFramePerformance(
      [
        { ...row('mixed'), type: 'game_opened', reviewer: true, agentMode: true, artifactVersion: 'a'.repeat(64) },
        row('mixed'),
      ],
      'only',
    );
    expect(report.measuredSessions).toBe(1);
    expect(report.groups[0]).toMatchObject({ reviewer: true, artifactVersion: 'a'.repeat(64), windows: 1 });
  });

  it('applies the requested performance cohort without changing player health or exposing rows', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:boss' });
    await store.appendTelemetryEvents(date, [
      row('player'),
      row('reviewer', { reviewer: true }),
      row('agent', { reviewer: true, agentMode: true }),
    ]);
    const app = await buildApp({ store, sessionSecret: secret, adminUids: 'g:boss' });
    try {
      for (const [cohort, count] of [
        ['include', 2],
        ['exclude', 1],
        ['only', 1],
      ] as const) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/admin/telemetry/health?days=1&performanceReviewers=${cohort}`,
          headers: headers('g:boss'),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().performance.measuredSessions).toBe(count);
        expect(res.json().games[0].aliveTicks).toBe(1);
        expect(res.body).not.toContain('sessionId');
      }
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/admin/telemetry/health?performanceReviewers=bogus',
            headers: headers('g:boss'),
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });
});
