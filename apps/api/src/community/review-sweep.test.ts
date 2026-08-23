import { describe, expect, it } from 'vitest';
import { effectiveReleasedCount, releasedSlugs, REVIEW_SWEEP_DAY_MS, summarizeSweepProgress } from './review-sweep.js';
import type { ReviewSweep } from '../store.js';

function sweep(partial: Partial<ReviewSweep> & Pick<ReviewSweep, 'slugs' | 'releasedCount'>): ReviewSweep {
  return {
    id: 'swp-test',
    status: 'active',
    source: 'catalog',
    releasePerDay: null,
    startedAt: '2026-08-01T00:00:00.000Z',
    note: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    createdBy: 'dev:boss',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: 'dev:boss',
    notifiedAt: null,
    notifiedCount: 0,
    ...partial,
  };
}

describe('effectiveReleasedCount', () => {
  it('honours the manual floor when there is no drip', () => {
    const row = sweep({ slugs: ['a', 'b', 'c', 'd'], releasedCount: 2 });
    expect(effectiveReleasedCount(row, Date.parse('2026-08-05T00:00:00.000Z'))).toBe(2);
    expect(releasedSlugs(row, Date.parse('2026-08-05T00:00:00.000Z'))).toEqual(['a', 'b']);
  });

  it('drips releasePerDay per elapsed 24h window while active', () => {
    const started = Date.parse('2026-08-01T00:00:00.000Z');
    const row = sweep({
      slugs: Array.from({ length: 30 }, (_, i) => `g${i}`),
      releasedCount: 5,
      releasePerDay: 5,
      startedAt: new Date(started).toISOString(),
    });
    expect(effectiveReleasedCount(row, started)).toBe(5);
    expect(effectiveReleasedCount(row, started + REVIEW_SWEEP_DAY_MS)).toBe(10);
    expect(effectiveReleasedCount(row, started + 3 * REVIEW_SWEEP_DAY_MS)).toBe(20);
  });

  it('freezes the drip while paused', () => {
    const started = Date.parse('2026-08-01T00:00:00.000Z');
    const row = sweep({
      status: 'paused',
      slugs: Array.from({ length: 30 }, (_, i) => `g${i}`),
      releasedCount: 5,
      releasePerDay: 5,
      startedAt: new Date(started).toISOString(),
    });
    expect(effectiveReleasedCount(row, started + 10 * REVIEW_SWEEP_DAY_MS)).toBe(5);
  });
});

describe('summarizeSweepProgress', () => {
  it('counts assessed games among the released prefix', () => {
    const row = sweep({ slugs: ['a', 'b', 'c'], releasedCount: 2 });
    expect(summarizeSweepProgress(row, new Set(['a', 'c']), Date.now())).toEqual(
      expect.objectContaining({ total: 3, released: 2, assessedReleased: 1, remainingInPool: 1 }),
    );
  });
});
