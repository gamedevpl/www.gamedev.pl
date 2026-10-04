import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../store/in-memory.js';
import { createCreatorPerformanceReader, PERFORMANCE_CACHE_MS } from './creator-performance.js';
import type { TelemetryEvent } from '../platform/store.js';
import type { GamePerformanceQuery } from '@gamedevpl/contract';
import { buildApp } from '../platform/app.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../platform/auth.js';

const uid = 'g:owner';
const date = '2026-10-04';
const query: GamePerformanceQuery = { slug: 'space-hop', days: 1, performanceReviewers: 'include' };
const performance = {
  version: 1 as const,
  source: 'raf' as const,
  valid: true,
  elapsedMs: 5000,
  intervals: [299, 0, 0, 0, 0, 0, 0, 0],
  maxGapMs: 17,
  viewportWidth: 1280,
  viewportHeight: 800,
  canvasWidth: 1280,
  canvasHeight: 800,
  canvasCssWidth: 1280,
  canvasCssHeight: 800,
  dpr: 2,
  orientation: 'landscape' as const,
  state: 'playing' as const,
};
const row = (sessionId: string, extras: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  slug: query.slug,
  sessionId,
  at: `${date}T10:00:05Z`,
  type: 'alive',
  frames: 300,
  performance,
  ...extras,
});
async function fixture() {
  const store = new InMemoryStore();
  await store.upsertUser({ uid });
  await store.upsertUser({ uid: 'g:other' });
  await store.createSubmission(1, uid, 'Space Hop');
  await store.setSubmissionSlug(1, query.slug);
  await store.setSubmissionPublishedAt(1, `${date}T00:00:00Z`);
  await store.ensureGameAccess(query.slug, uid, `${date}T00:00:00Z`, `${date}T00:00:00Z`);
  return store;
}

describe('creator performance service', () => {
  it('shares a bounded scan across cohort/build filters and returns only aggregates', async () => {
    const store = await fixture();
    const build = 'a'.repeat(64);
    await store.appendTelemetryEvents(date, [
      row('p', { type: 'game_opened', artifactVersion: build }),
      row('p'),
      row('r', { type: 'game_opened', reviewer: true, artifactVersion: build }),
      row('r', { reviewer: true }),
      row('r', { reviewer: true, agentMode: true }),
      row('invalid', { performance: { ...performance, valid: false } }),
    ]);
    let clock = Date.parse(`${date}T12:00:00Z`);
    const read = createCreatorPerformanceReader(store, () => clock);
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    const all = await read(uid, query);
    const only = await read(uid, { ...query, performanceReviewers: 'only', artifactVersion: build });
    expect(all.ok && all.report.measuredSessions).toBe(2);
    expect(all.ok && all.report.agentEventsExcluded).toBe(1);
    expect(all.ok && all.report.invalidWindows).toBe(1);
    expect(only.ok && only.report.groups.every((g) => g.reviewer)).toBe(true);
    expect(only.ok && only.report.measuredSessions).toBe(1);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith(date, { slug: query.slug, limit: 1000 });
    expect(JSON.stringify(all)).not.toMatch(/sessionId|g:owner|"p"/);
    clock += PERFORMANCE_CACHE_MS;
    await read(uid, query);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('denies foreign/former owners before scans and rechecks authority after in-flight scans', async () => {
    const store = await fixture();
    const read = createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`));
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    expect(await read('g:other', query)).toEqual({ ok: false, code: 'not_owner' });
    expect(scan).not.toHaveBeenCalled();
    const access = (await store.getGameAccess(query.slug))!;
    let current = access;
    vi.spyOn(store, 'getGameAccess').mockImplementation(async () => current);
    await read(uid, query);
    current = { ...access, ownerUid: 'g:other', accessRevision: 2 };
    expect(await read(uid, query)).toEqual({ ok: false, code: 'not_owner' });
    current = { ...access, accessRevision: 3 };
    scan.mockImplementation(async () => {
      current = { ...access, ownerUid: 'g:other', accessRevision: 4 };
      return [];
    });
    expect(await read(uid, query)).toEqual({ ok: false, code: 'not_owner' });
  });

  it.each(['disabled', 'archived'] as const)(
    'refuses a game %s during a cold scan and never caches that window',
    async (state) => {
      const store = await fixture();
      const publication = {
        slug: query.slug,
        state: 'published' as const,
        currentVersion: 'v1',
        publishedAt: `${date}T00:00:00Z`,
      };
      await store.setPublication(publication);
      const read = createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`));
      const scan = vi.spyOn(store, 'listTelemetryEvents').mockImplementationOnce(async () => {
        await store.setPublication({ ...publication, state });
        return [row('old')];
      });
      expect(await read(uid, query)).toEqual({ ok: false, code: 'not_published' });
      expect(await read(uid, query)).toEqual({ ok: false, code: 'not_published' });
      expect(scan).toHaveBeenCalledTimes(1);
      await store.setPublication(publication);
      await store.appendTelemetryEvents(date, [row('new', { frames: 100 })]);
      const afterRepublish = await read(uid, query);
      expect(afterRepublish.ok && afterRepublish.report.groups[0]!.rafFps).toBe(20);
      expect(scan).toHaveBeenCalledTimes(2);
    },
  );

  it('rechecks publication on cache hits and invalidates a withdrawn window', async () => {
    const store = await fixture();
    const publication = {
      slug: query.slug,
      state: 'published' as const,
      currentVersion: 'v1',
      publishedAt: `${date}T00:00:00Z`,
    };
    await store.setPublication(publication);
    await store.appendTelemetryEvents(date, [row('p')]);
    const read = createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`));
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    expect((await read(uid, query)).ok).toBe(true);
    const status = vi
      .spyOn(store, 'getPublication')
      .mockResolvedValueOnce(publication)
      .mockResolvedValueOnce({ ...publication, state: 'archived' });
    expect(await read(uid, query)).toEqual({ ok: false, code: 'not_published' });
    expect(scan).toHaveBeenCalledTimes(1);
    status.mockRestore();
    expect((await read(uid, query)).ok).toBe(true);
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('distinguishes missing traffic, invalid/agent windows and capped reads', async () => {
    const store = await fixture();
    const read = createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`));
    const noTraffic = await read(uid, query);
    expect(noTraffic.ok && noTraffic.report.status).toBe('no_traffic');
    const full = await fixture();
    await full.appendTelemetryEvents(
      date,
      Array.from({ length: 1001 }, (_, i) => row(String(i), { agentMode: true, reviewer: true })),
    );
    const response = await createCreatorPerformanceReader(full, () => Date.parse(`${date}T12:00:00Z`))(uid, query);
    expect(response.ok && response.report.status).toBe('no_valid_windows');
    expect(response.ok && response.report.scanTruncated).toBe(true);
    expect(response.ok && response.report.measuredSessions).toBe(0);
  });

  it('refuses editors, blocked accounts and withdrawn games without reading telemetry', async () => {
    const store = await fixture();
    const access = (await store.getGameAccess(query.slug))!;
    vi.spyOn(store, 'getGameAccess').mockResolvedValue({ ...access, editorUids: ['g:other'] });
    const read = createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`));
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    expect(await read('g:other', query)).toEqual({ ok: false, code: 'not_owner' });
    await store.upsertUser({ uid, tier: 'blocked' });
    expect(await read(uid, query)).toEqual({ ok: false, code: 'not_owner' });
    await store.upsertUser({ uid, tier: 'free' });
    vi.spyOn(store, 'getPublication').mockResolvedValue({ slug: query.slug, state: 'archived' } as never);
    expect(await read(uid, query)).toEqual({ ok: false, code: 'not_published' });
    expect(scan).not.toHaveBeenCalled();
  });

  it('caps a multi-day scan at 5000 events and reports incomplete groups', async () => {
    const store = await fixture();
    const scan = vi
      .spyOn(store, 'listTelemetryEvents')
      .mockImplementation(async (_day, options) =>
        Array.from({ length: options!.limit! }, (_, i) =>
          row(String(i), { performance: { ...performance, viewportWidth: i } }),
        ),
      );
    const result = await createCreatorPerformanceReader(store, () => Date.parse(`${date}T12:00:00Z`))(uid, {
      ...query,
      days: 30,
    });
    expect(scan).toHaveBeenCalledTimes(5);
    expect(result.ok && result.report.days.length).toBe(5);
    expect(result.ok && result.report.scanTruncated).toBe(true);
    expect(result.ok && result.report.groupsTruncated).toBe(true);
    expect(result.ok && result.report.groups.length).toBe(100);
  });

  it('coalesces concurrent reads and shares the existing account scan budget', async () => {
    const store = await fixture();
    const budget = vi.spyOn(store, 'checkAndIncrementStudioHealthScans');
    const scan = vi.spyOn(store, 'listTelemetryEvents');
    const clock = Date.parse(`${date}T12:00:00Z`);
    const read = createCreatorPerformanceReader(store, () => clock);
    const replies = await Promise.all([read(uid, query), read(uid, { ...query, performanceReviewers: 'only' })]);
    expect(replies.every((r) => r.ok)).toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);
    expect(budget).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 29; i++) await store.checkAndIncrementStudioHealthScans(uid, `${date}T12`, 30);
    expect((await read(uid, query)).ok).toBe(true);
    expect(await read(uid, { ...query, days: 2 })).toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 3600,
    });
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('exposes the owner route with authentication and query validation', async () => {
    const store = await fixture();
    const secret = 'session-secret-for-performance-test';
    const app = await buildApp({ store, sessionSecret: secret });
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken(uid, secret)}` };
    try {
      expect((await app.inject({ url: '/api/me/studio/performance?slug=space-hop' })).statusCode).toBe(401);
      expect((await app.inject({ url: '/api/me/studio/performance?slug=space-hop&days=31', headers })).statusCode).toBe(
        400,
      );
      expect((await app.inject({ url: '/api/me/studio/performance?slug=space-hop', headers })).statusCode).toBe(200);
      const other = { cookie: `${SESSION_COOKIE_NAME}=${mintSessionToken('g:other', secret)}` };
      expect((await app.inject({ url: '/api/me/studio/performance?slug=space-hop', headers: other })).statusCode).toBe(
        404,
      );
    } finally {
      await app.close();
    }
  });
});
