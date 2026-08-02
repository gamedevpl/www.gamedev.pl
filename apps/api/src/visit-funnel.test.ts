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

  it('reports the creation funnel in step order, zeroes included', () => {
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'create_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      step('a', 'prompt_started'),
      step('a', 'spec_submitted'),
      step('a', 'signin_required'),
      started('b'),
      step('b', 'prompt_started'),
      started('c'),
    ]);

    // Every rung present even when nobody reached it — a missing rung reads as
    // "nothing to see" when it is exactly where everyone stopped.
    expect(funnel.creating).toEqual([
      { step: 'prompt_started', visits: 2 },
      { step: 'spec_submitted', visits: 1 },
      { step: 'signin_required', visits: 1 },
      { step: 'qa_shown', visits: 0 },
      { step: 'title_confirmed', visits: 0 },
      { step: 'submission_created', visits: 0 },
    ]);
  });

  it('counts a repeated step once per visit', () => {
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'create_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    // A duplicated or replayed flush must not inflate a rung.
    const funnel = summarizeVisitFunnel([started('a'), step('a', 'prompt_started'), step('a', 'prompt_started')]);
    expect(funnel.creating[0]).toEqual({ step: 'prompt_started', visits: 1 });
  });

  it('reports the waitlist funnel in step order, zeroes included', () => {
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'waitlist_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      step('a', 'cta_clicked'),
      step('a', 'joined'),
      started('b'),
      step('b', 'cta_clicked'),
      started('c'),
    ]);

    expect(funnel.waitlist).toEqual([
      { step: 'cta_clicked', visits: 2 },
      { step: 'joined', visits: 1 },
    ]);
  });

  it('keeps waitlist and create steps from colliding', () => {
    // Both event types share the `step` field on the wire; a shared Set would make a
    // waitlist click look like a create step if the names ever overlapped.
    const funnel = summarizeVisitFunnel([
      started('a'),
      { visitId: 'a', type: 'waitlist_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'cta_clicked' },
      { visitId: 'a', type: 'create_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 1, step: 'prompt_started' },
    ]);
    expect(funnel.waitlist[0]).toEqual({ step: 'cta_clicked', visits: 1 });
    expect(funnel.creating[0]).toEqual({ step: 'prompt_started', visits: 1 });
    expect(funnel.waitlist.find((row) => row.step === 'joined')?.visits).toBe(0);
  });

  it('reports the editing funnel in step order, zeroes included', () => {
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'editor_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      step('a', 'opened'),
      step('a', 'draft_saved'),
      step('a', 'previewed'),
      step('a', 'published'),
      started('b'),
      step('b', 'opened'),
      // A repeated save in one visit is one visit at that rung, not two.
      step('b', 'draft_saved'),
      step('b', 'draft_saved'),
      started('c'),
    ]);

    expect(funnel.editing).toEqual([
      { step: 'opened', visits: 2 },
      { step: 'draft_saved', visits: 2 },
      { step: 'previewed', visits: 1 },
      { step: 'published', visits: 1 },
    ]);
  });

  it('keeps editor steps out of the create and waitlist funnels', () => {
    // All three event types share the `step` field on the wire; separate Sets are what
    // stop an editor save from ever reading as a create or waitlist rung.
    const funnel = summarizeVisitFunnel([
      started('a'),
      { visitId: 'a', type: 'editor_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'opened' },
      { visitId: 'a', type: 'create_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 1, step: 'prompt_started' },
      { visitId: 'a', type: 'waitlist_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 2, step: 'cta_clicked' },
    ]);
    expect(funnel.editing[0]).toEqual({ step: 'opened', visits: 1 });
    expect(funnel.editing.find((row) => row.step === 'published')?.visits).toBe(0);
    expect(funnel.creating[0]).toEqual({ step: 'prompt_started', visits: 1 });
    expect(funnel.waitlist[0]).toEqual({ step: 'cta_clicked', visits: 1 });
  });

  it('survives a window with no events at all', () => {
    const funnel = summarizeVisitFunnel([]);
    expect(funnel).toMatchObject({ visits: 0, bounces: 0, plays: 0, medianPlaysPerPlayingVisit: 0 });
    expect(funnel.entries).toEqual([]);
    expect(funnel.waitlist).toEqual([
      { step: 'cta_clicked', visits: 0 },
      { step: 'joined', visits: 0 },
    ]);
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

  it('answers how-to-play open rate, same-card reopens, via, and deep-link vs arcade', () => {
    const opened = (visitId: string, via: string | undefined, msSinceStart: number, reopen?: true): VisitEvent => ({
      visitId,
      type: 'how_to_play_opened',
      at: '2026-07-26T10:00:00.000Z',
      msSinceStart,
      ...(via === undefined ? {} : { via }),
      ...(reopen === undefined ? {} : { reopen }),
    });

    const funnel = summarizeVisitFunnel([
      // Arcade visit: same card opened again — the "card did not answer" case.
      started('a', { entry: 'home' }),
      played('a', 1_000),
      opened('a', 'bar', 2_000),
      opened('a', 'bar', 5_000, true),
      // Deep-link visit: opened once from More.
      started('b', { entry: 'play' }),
      played('b', 500),
      opened('b', 'more', 800),
      // Played, never opened — in the open-rate and byEntry denominators.
      started('c', { entry: 'home' }),
      played('c', 1_000),
      // Legacy open with no via — must still count, under unknown.
      started('d', { entry: 'home' }),
      played('d', 1_000),
      opened('d', undefined, 1_500),
      // Opened without a published play — excluded from the numerator entirely.
      started('e', { entry: 'home' }),
      opened('e', 'bar', 100),
    ]);

    expect(funnel.howToPlay.opens).toBe(4);
    expect(funnel.howToPlay.visits).toBe(3);
    expect(funnel.howToPlay.repeatVisits).toBe(1);
    expect(funnel.howToPlay.via).toEqual([
      { via: 'bar', opens: 2, visits: 1 },
      { via: 'more', opens: 1, visits: 1 },
      { via: 'unknown', opens: 1, visits: 1 },
    ]);
    expect(funnel.howToPlay.byEntry.find((row) => row.entry === 'home')).toEqual({
      entry: 'home',
      playingVisits: 3,
      visits: 2,
      opens: 3,
    });
    expect(funnel.howToPlay.byEntry.find((row) => row.entry === 'play')).toEqual({
      entry: 'play',
      playingVisits: 1,
      visits: 1,
      opens: 1,
    });
  });

  it('does not treat one open per game in a multi-game visit as a same-card reopen', () => {
    // Two plays, one how-to-play open each, neither flagged reopen — normal arcade depth.
    const funnel = summarizeVisitFunnel([
      started('a'),
      played('a', 1_000),
      {
        visitId: 'a',
        type: 'how_to_play_opened',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart: 1_500,
        via: 'bar',
      },
      played('a', 10_000),
      {
        visitId: 'a',
        type: 'how_to_play_opened',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart: 11_000,
        via: 'bar',
      },
    ]);
    expect(funnel.howToPlay.opens).toBe(2);
    expect(funnel.howToPlay.visits).toBe(1);
    expect(funnel.howToPlay.repeatVisits).toBe(0);
  });

  it('emits zeroed how-to-play via rows when nobody opened the card', () => {
    const funnel = summarizeVisitFunnel([started('a'), played('a', 1_000)]);
    expect(funnel.howToPlay).toEqual({
      opens: 0,
      visits: 0,
      repeatVisits: 0,
      via: [
        { via: 'bar', opens: 0, visits: 0 },
        { via: 'more', opens: 0, visits: 0 },
      ],
      byEntry: [{ entry: 'home', playingVisits: 1, visits: 0, opens: 0 }],
    });
  });
});
