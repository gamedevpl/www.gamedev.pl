import { describe, expect, it } from 'vitest';
import { summarizeVisitFunnel } from './visit-funnel.js';
import type { VisitEvent } from '../store.js';

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
      { step: 'handoff_shown', visits: 0 },
      { step: 'handoff_enter_studio', visits: 0 },
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
      { step: 'v2_schema_loaded', visits: 0 },
      { step: 'v2_content_loaded', visits: 0 },
      { step: 'v2_controller_ready', visits: 0 },
      { step: 'v2_controller_failed', visits: 0 },
      { step: 'controller_loaded', visits: 0 },
      { step: 'controller_failed', visits: 0 },
      { step: 'tool_used', visits: 0 },
      { step: 'undo_used', visits: 0 },
      { step: 'selection_from_game', visits: 0 },
    ]);
  });

  it('reports the Code surface funnel in step order, zeroes included', () => {
    const step = (visitId: string, step: string): VisitEvent =>
      ({ visitId, type: 'code_step', at: '2026-08-11T10:00:00.000Z', msSinceStart: 0, step }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      step('a', 'offered'),
      step('a', 'opened'),
      step('a', 'file_opened'),
      step('a', 'edited'),
      step('a', 'delivered'),
      started('b'),
      step('b', 'offered'),
      // A repeated edit in one visit counts once, not twice.
      step('b', 'edited'),
      step('b', 'edited'),
      started('c'),
    ]);

    expect(funnel.coding).toEqual([
      { step: 'offered', visits: 2 },
      { step: 'opened', visits: 1 },
      { step: 'file_opened', visits: 1 },
      { step: 'edited', visits: 2 },
      { step: 'typechecked', visits: 0 },
      { step: 'previewed', visits: 0 },
      { step: 'delivered', visits: 1 },
      { step: 'published', visits: 0 },
      { step: 'read_only_agent', visits: 0 },
      { step: 'conflict_seen', visits: 0 },
      { step: 'round_reopened', visits: 0 },
      { step: 'restored_missing', visits: 0 },
      { step: 'agent_mode_enabled', visits: 0 },
      { step: 'agent_mode_disabled', visits: 0 },
      { step: 'agent_console_run', visits: 0 },
    ]);
  });

  it('reports completion health and latency separately for each lane', () => {
    const completion = (
      visitId: string,
      kind: 'language_service' | 'ghost_text',
      outcome: 'shown' | 'empty' | 'failed',
      latencyMs: number,
    ): VisitEvent =>
      ({
        visitId,
        type: 'code_completion',
        at: '2026-08-15T10:00:00.000Z',
        msSinceStart: latencyMs,
        kind,
        outcome,
        latencyMs,
      }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      completion('a', 'language_service', 'shown', 100),
      completion('a', 'language_service', 'empty', 200),
      completion('b', 'ghost_text', 'shown', 500),
      completion('b', 'ghost_text', 'failed', 900),
    ]);

    expect(funnel.completion).toEqual({
      requests: 4,
      shown: 2,
      empty: 1,
      failed: 1,
      byKind: [
        {
          kind: 'language_service',
          requests: 2,
          shown: 1,
          empty: 1,
          failed: 0,
          medianLatencyMs: 150,
          p90LatencyMs: 200,
        },
        {
          kind: 'ghost_text',
          requests: 2,
          shown: 1,
          empty: 0,
          failed: 1,
          medianLatencyMs: 700,
          p90LatencyMs: 900,
        },
      ],
    });
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

  it('reports the invite funnel separately from the waitlist', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      { visitId: 'a', type: 'invite_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'opened' },
      { visitId: 'a', type: 'invite_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 1, step: 'accepted' },
      started('b'),
      { visitId: 'b', type: 'invite_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'opened' },
    ]);

    expect(funnel.invites).toEqual([
      { step: 'opened', visits: 2 },
      { step: 'accepted', visits: 1 },
      { step: 'unavailable', visits: 0 },
    ]);
    expect(funnel.waitlist[0]).toEqual({ step: 'cta_clicked', visits: 0 });
  });

  it('reports the beta welcome funnel separately from invite steps', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      { visitId: 'a', type: 'beta_welcome_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'shown' },
      {
        visitId: 'a',
        type: 'beta_welcome_step',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart: 1,
        step: 'continued',
      },
      started('b'),
      { visitId: 'b', type: 'beta_welcome_step', at: '2026-07-26T10:00:00.000Z', msSinceStart: 0, step: 'shown' },
    ]);

    expect(funnel.betaWelcome).toEqual([
      { step: 'shown', visits: 2 },
      { step: 'continued', visits: 1 },
      { step: 'dismissed', visits: 0 },
    ]);
  });

  it('counts painting visits and splits them by the door that led to the brush', () => {
    const remix = (visitId: string, step: string, via?: string): VisitEvent =>
      ({
        visitId,
        type: 'remix_step',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart: 0,
        step,
        ...(via ? { via } : {}),
      }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      remix('a', 'opened'),
      remix('a', 'painted', 'redirect'),
      started('b'),
      remix('b', 'opened'),
      remix('b', 'painted', 'menu'),
      started('c'),
      remix('c', 'opened'),
      // A client from before the dimension existed: painted, door unknown.
      remix('c', 'painted'),
      started('d'),
      remix('d', 'opened'),
      remix('d', 'tuned'),
    ]);

    expect(funnel.remixing.find((row) => row.step === 'painted')?.visits).toBe(3);
    expect(funnel.remixing.find((row) => row.step === 'tuned')?.visits).toBe(1);
    expect(funnel.remixPaintedVia).toEqual([
      { via: 'redirect', visits: 1 },
      { via: 'menu', visits: 1 },
      { via: 'panel', visits: 0 },
      { via: 'unknown', visits: 1 },
    ]);
  });

  it('counts every play by the home-page surface that produced it, not deduped per visit', () => {
    const playedVia = (visitId: string, via?: string, msSinceStart = 0): VisitEvent =>
      ({
        visitId,
        type: 'play_started',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart,
        ...(via ? { via } : {}),
      }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      // One visit, two surfaces — both plays must count.
      playedVia('a', 'featured'),
      playedVia('a', 'rail_continue', 1_000),
      started('b'),
      playedVia('b', 'rail_continue'),
      started('c'),
      playedVia('c', 'grid'),
      started('d'),
      // Outside every covered surface — rolls up as unknown.
      playedVia('d'),
    ]);

    expect(funnel.plays).toBe(5);
    expect(funnel.playVia).toEqual([
      { via: 'featured', plays: 1 },
      { via: 'rail_start_here', plays: 0 },
      { via: 'rail_continue', plays: 2 },
      { via: 'rail_party', plays: 0 },
      { via: 'rail_new', plays: 0 },
      { via: 'grid', plays: 1 },
      { via: 'composer_match', plays: 0 },
      { via: 'create_showcase', plays: 0 },
      { via: 'shelf', plays: 0 },
      { via: 'featured_similar', plays: 0 },
      { via: 'party_page', plays: 0 },
      { via: 'unknown', plays: 1 },
    ]);
  });

  it('omits the unknown playVia row when every play in the window carried one', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      {
        visitId: 'a',
        type: 'play_started',
        at: '2026-07-26T10:00:00.000Z',
        msSinceStart: 0,
        via: 'featured',
      } as VisitEvent,
    ]);

    expect(funnel.playVia.find((row) => row.via === 'unknown')).toBeUndefined();
  });

  it('reads the remix entry against everyone who was shown it, split by control and by when', () => {
    const remix = (visitId: string, step: string, options?: { control?: string; msSinceStart?: number }): VisitEvent =>
      ({
        visitId,
        type: 'remix_step',
        at: '2026-08-03T10:00:00.000Z',
        msSinceStart: options?.msSinceStart ?? 0,
        step,
        ...(options?.control ? { control: options.control } : {}),
      }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      started('a'),
      remix('a', 'offered'),
      remix('a', 'opened', { control: 'bar', msSinceStart: 20_000 }),
      started('b'),
      remix('b', 'offered'),
      remix('b', 'opened', { control: 'more', msSinceStart: 80_000 }),
      started('c'),
      remix('c', 'offered'),
      // A client from before the dimension existed: opened, control unknown.
      remix('c', 'opened', { msSinceStart: 60_000 }),
      // Shown it and never touched it — the whole reason `offered` exists.
      started('d'),
      remix('d', 'offered'),
      started('e'),
      remix('e', 'offered'),
      remix('e', 'opened', { control: 'page', msSinceStart: 40_000 }),
    ]);

    expect(funnel.remixEntry.offered).toBe(5);
    expect(funnel.remixEntry.opened).toBe(4);
    expect(funnel.remixEntry.byControl).toEqual([
      { control: 'page', visits: 1 },
      { control: 'bar', visits: 1 },
      { control: 'more', visits: 1 },
      { control: 'unknown', visits: 1 },
    ]);
    // Median of the four that opened one — the visit that never did contributes
    // no delay, because including it would measure the window rather than them.
    expect(funnel.remixEntry.medianSecondsToOpen).toBe(50);
  });

  it('never reports more opens than offers, even while old clients are still running', () => {
    // A tab from before this deploy records `opened` and never `offered`. Counting
    // every open against only the new offers put legacy visits in the numerator
    // and none of them in the denominator — "3 of 1", a rate over 100%, which
    // discredits the experiment the number exists to settle.
    const remix = (visitId: string, step: string, control?: string): VisitEvent =>
      ({
        visitId,
        type: 'remix_step',
        at: '2026-08-03T10:00:00.000Z',
        msSinceStart: 5_000,
        step,
        ...(control ? { control } : {}),
      }) as VisitEvent;

    const funnel = summarizeVisitFunnel([
      // Two legacy visits: opened, never offered.
      started('old-1'),
      remix('old-1', 'opened'),
      started('old-2'),
      remix('old-2', 'opened'),
      // One current visit, all the way through.
      started('new'),
      remix('new', 'offered'),
      remix('new', 'opened', 'bar'),
    ]);

    expect(funnel.remixEntry.offered).toBe(1);
    expect(funnel.remixEntry.opened).toBe(1);
    expect(funnel.remixEntry.opened).toBeLessThanOrEqual(funnel.remixEntry.offered);
    // The splits come from the same cohort, or they would disagree with the ratio.
    expect(funnel.remixEntry.byControl).toEqual([
      { control: 'page', visits: 0 },
      { control: 'bar', visits: 1 },
      { control: 'more', visits: 0 },
    ]);
    // Nothing is lost: the legacy opens are still on the funnel's own rung.
    expect(funnel.remixing.find((row) => row.step === 'opened')?.visits).toBe(3);
  });

  it('reports no median when nobody opened a remix, rather than an instant one', () => {
    const funnel = summarizeVisitFunnel([
      started('a'),
      {
        visitId: 'a',
        type: 'remix_step',
        at: '2026-08-03T10:00:00.000Z',
        msSinceStart: 0,
        step: 'offered',
      } as VisitEvent,
    ]);
    expect(funnel.remixEntry.offered).toBe(1);
    expect(funnel.remixEntry.opened).toBe(0);
    // `0` would read as "they open it the instant they see it", which is the
    // opposite of what no data means.
    expect(funnel.remixEntry.medianSecondsToOpen).toBeNull();
  });

  it('emits zeroed door rows while nobody has painted, so the split cannot read as missing', () => {
    const funnel = summarizeVisitFunnel([started('a')]);
    expect(funnel.remixPaintedVia).toEqual([
      { via: 'redirect', visits: 0 },
      { via: 'menu', visits: 0 },
      { via: 'panel', visits: 0 },
    ]);
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
