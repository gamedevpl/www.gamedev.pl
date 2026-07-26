import { describe, expect, it } from 'vitest';
import { summarizeVisitFunnel } from './visit-funnel.js';
import type { VisitEvent } from './store.js';

function started(visitId: string, extra: Partial<VisitEvent> = {}): VisitEvent {
  return { visitId, type: 'visit_started', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, entry: 'home', ...extra };
}

function played(visitId: string, msSinceStart: number): VisitEvent {
  return { visitId, type: 'play_started', at: '2026-07-26T10:00:00.000Z', msSinceStart };
}

describe('summarizeVisitFunnel', () => {
  it('counts visits, bounces, and plays', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      played('a', 5_000),
      started('b'), // landed, never played
      started('c'),
      played('c', 1_000),
      played('c', 20_000),
    ]);

    expect(funnel.visits).toBe(3);
    expect(funnel.bounces).toBe(1);
    expect(funnel.visitsWithPlay).toBe(2);
    expect(funnel.plays).toBe(3);
  });

  it('answers session depth — the question play telemetry cannot', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      played('a', 1_000),
      started('b'),
      played('b', 1_000),
      played('b', 2_000),
      played('b', 3_000),
    ]);

    expect(funnel.depth).toEqual([
      { plays: 1, visits: 1 },
      { plays: 3, visits: 1 },
    ]);
    expect(funnel.medianPlaysPerPlayingVisit).toBe(2);
  });

  it('buckets time to first play and takes the earliest play, not the first row seen', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      // Deliberately out of order: a flush can deliver these either way round, and the
      // answer must not depend on which was written first.
      played('a', 45_000),
      played('a', 8_000),
    ]);

    expect(funnel.timeToFirstPlay).toEqual([{ upToSeconds: 10, visits: 1 }]);
    expect(funnel.medianSecondsToFirstPlay).toBe(8);
  });

  it('puts a very slow first play in the overflow bucket', () => {
    const funnel = summarizeVisitFunnel([started('a'), played('a', 20 * 60 * 1000)]);
    expect(funnel.timeToFirstPlay).toEqual([{ upToSeconds: null, visits: 1 }]);
  });

  it('separates a shared game link from a home landing', () => {
    const funnel = summarizeVisitFunnel([
      started('a', { entry: 'play', referrer: 'x.com' }),
      played('a', 2_000),
      started('b', { entry: 'home' }),
    ]);

    // Asserted by lookup rather than position: with equal visit counts the ordering is
    // a stable alphabetical tiebreak, which is not what this test is about.
    expect(funnel.entries).toHaveLength(2);
    expect(funnel.entries.find((row) => row.entry === 'play')).toEqual({ entry: 'play', visits: 1, plays: 1 });
    expect(funnel.entries.find((row) => row.entry === 'home')).toEqual({ entry: 'home', visits: 1, plays: 0 });
  });

  it('attributes acquisition, bucketing missing referrers as direct', () => {
    const funnel = summarizeVisitFunnel([
      started('a', { referrer: 'news.ycombinator.com' }),
      played('a', 1_000),
      started('b', { referrer: 'news.ycombinator.com' }),
      started('c'), // no referrer
    ]);

    expect(funnel.referrers).toEqual([
      { referrer: 'news.ycombinator.com', visits: 2, plays: 1 },
      { referrer: 'direct', visits: 1, plays: 0 },
    ]);
  });

  it('groups campaigns and omits visits carrying no UTM values', () => {
    const funnel = summarizeVisitFunnel([
      started('a', { utmSource: 'linkedin', utmCampaign: 'beta' }),
      played('a', 1_000),
      started('b', { utmSource: 'linkedin', utmCampaign: 'beta' }),
      started('c'),
    ]);

    expect(funnel.campaigns).toEqual([{ source: 'linkedin', campaign: 'beta', visits: 2, plays: 1 }]);
  });

  it('survives a window with no events at all', () => {
    const funnel = summarizeVisitFunnel([]);
    expect(funnel).toMatchObject({ visits: 0, bounces: 0, plays: 0, medianPlaysPerPlayingVisit: 0 });
    expect(funnel.entries).toEqual([]);
  });

  it('counts a visit whose landing event fell outside the window', () => {
    // A visit that started just before midnight has its play in the next partition. It
    // is still a real visit; dropping it would silently under-count plays at every day
    // boundary.
    const funnel = summarizeVisitFunnel([played('orphan', 1_000)]);
    expect(funnel.visits).toBe(1);
    expect(funnel.plays).toBe(1);
    expect(funnel.entries).toEqual([{ entry: 'unknown', visits: 1, plays: 1 }]);
  });
});
