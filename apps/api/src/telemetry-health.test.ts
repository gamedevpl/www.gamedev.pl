import { describe, expect, it } from 'vitest';
import { recentPartitions, summarizeGameHealth } from './telemetry-health.js';
import type { TelemetryEvent } from './store.js';

/**
 * Builds a session's events from offsets, dating each one from a base wall clock so the
 * two clocks agree — which is the normal case. Tests that care about them disagreeing
 * (sleep, throttling) construct their events by hand.
 */
function session(
  slug: string,
  sessionId: string,
  base: string,
  events: Array<Partial<TelemetryEvent> & { type: TelemetryEvent['type']; msSinceOpen: number }>,
): TelemetryEvent[] {
  const baseMs = Date.parse(base);
  return events.map((event) => ({
    slug,
    sessionId,
    at: new Date(baseMs + event.msSinceOpen).toISOString(),
    ...event,
  })) as TelemetryEvent[];
}

/** A minute of clean play: an open, 5s liveness ticks at 60fps, 15s play_time beats. */
function healthySession(slug: string, sessionId: string, base: string, seconds = 60) {
  const events: Array<Partial<TelemetryEvent> & { type: TelemetryEvent['type']; msSinceOpen: number }> = [
    { type: 'game_opened', msSinceOpen: 0 },
  ];
  for (let elapsed = 5_000; elapsed <= seconds * 1_000; elapsed += 5_000) {
    events.push({ type: 'alive', frames: 300, msSinceOpen: elapsed });
    if (elapsed % 15_000 === 0) events.push({ type: 'play_time', seconds: 15, msSinceOpen: elapsed });
  }
  events.push({ type: 'game_closed', msSinceOpen: seconds * 1_000 + 500 });
  return session(slug, sessionId, base, events);
}

describe('summarizeGameHealth', () => {
  it('summarizes a clean session into play time and frame rate', () => {
    const [row] = summarizeGameHealth(healthySession('brick-storm', 's1', '2026-07-25T10:00:00.000Z'));

    expect(row.slug).toBe('brick-storm');
    expect(row.sessions).toBe(1);
    expect(row.closes).toBe(1);
    expect(row.bounces).toBe(0);
    // Four 15s beats across the minute.
    expect(row.totalPlaySeconds).toBe(60);
    expect(row.medianPlaySeconds).toBe(60);
    expect(row.errors).toBe(0);
    expect(row.stalledTicks).toBe(0);
    expect(row.stallRate).toBe(0);
    // 300 frames per 5s tick is 60fps.
    expect(row.medianFps).toBe(60);
    expect(row.resumeTicksIgnored).toBe(0);
  });

  it('counts a session that opened but never played as a bounce', () => {
    const events = session('apex-sprint', 's1', '2026-07-25T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'game_closed', msSinceOpen: 3_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.sessions).toBe(1);
    expect(row.bounces).toBe(1);
    expect(row.totalPlaySeconds).toBe(0);
  });

  it('counts a stalled game — frames observed but none drawn', () => {
    const events = session('frozen-game', 's1', '2026-07-25T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'alive', frames: 300, msSinceOpen: 5_000 },
      { type: 'alive', frames: 0, msSinceOpen: 10_000 },
      { type: 'alive', frames: 0, msSinceOpen: 15_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.aliveTicks).toBe(3);
    expect(row.stalledTicks).toBe(2);
    expect(row.stallRate).toBeCloseTo(2 / 3);
    expect(row.resumeTicksIgnored).toBe(0);
  });

  /**
   * The regression this module exists to avoid. Replays the shape of the real
   * `brick-storm` session of 2026-07-25: ~300 frames per tick during play, then the
   * machine slept for three hours, and the first tick after the resume reported one
   * frame. Reading that as a stall would condemn a perfectly healthy game.
   */
  it('does not count the first tick after a long gap as a stall', () => {
    const play = healthySession('brick-storm', 's1', '2026-07-25T10:04:39.000Z', 115);
    const afterSleep: TelemetryEvent[] = [
      {
        slug: 'brick-storm',
        sessionId: 's1',
        type: 'alive',
        frames: 1,
        // The monotonic clock froze while asleep: only 300s of offset for 3h17m of
        // wall clock. Either signal alone could be argued away; together they are plain.
        msSinceOpen: 415_800,
        at: '2026-07-25T13:23:16.891Z',
      },
    ];

    const [row] = summarizeGameHealth([...play, ...afterSleep]);
    expect(row.resumeTicksIgnored).toBe(1);
    expect(row.stalledTicks).toBe(0);
    expect(row.stallRate).toBe(0);
    // The healthy ticks still counted, and the resume tick did not drag the rate down.
    expect(row.medianFps).toBe(60);
  });

  it('catches a sleep that the monotonic clock hides but the wall clock does not', () => {
    const events: TelemetryEvent[] = [
      { slug: 'g', sessionId: 's1', type: 'game_opened', msSinceOpen: 0, at: '2026-07-25T10:00:00.000Z' },
      { slug: 'g', sessionId: 's1', type: 'alive', frames: 300, msSinceOpen: 5_000, at: '2026-07-25T10:00:05.000Z' },
      // Offsets say five seconds; the wall clock says two hours. Frozen clock, not play.
      { slug: 'g', sessionId: 's1', type: 'alive', frames: 0, msSinceOpen: 10_000, at: '2026-07-25T12:00:05.000Z' },
    ];

    const [row] = summarizeGameHealth(events);
    expect(row.resumeTicksIgnored).toBe(1);
    expect(row.stalledTicks).toBe(0);
  });

  it('still trusts a tick when an old client sends no offsets at all', () => {
    const events: TelemetryEvent[] = [
      { slug: 'g', sessionId: 's1', type: 'game_opened', at: '2026-07-25T10:00:00.000Z' },
      { slug: 'g', sessionId: 's1', type: 'alive', frames: 0, at: '2026-07-25T10:00:05.000Z' },
    ];

    const [row] = summarizeGameHealth(events);
    // No offsets to cross-check, but the wall clock is tight, so the stall is real.
    expect(row.aliveTicks).toBe(1);
    expect(row.stalledTicks).toBe(1);
    expect(row.resumeTicksIgnored).toBe(0);
  });

  it('takes the median across sessions rather than the mean, so one epic does not skew it', () => {
    const events = [
      ...healthySession('g', 's1', '2026-07-25T10:00:00.000Z', 15),
      ...healthySession('g', 's2', '2026-07-25T11:00:00.000Z', 15),
      ...healthySession('g', 's3', '2026-07-25T12:00:00.000Z', 600),
    ];

    const [row] = summarizeGameHealth(events);
    expect(row.sessions).toBe(3);
    expect(row.medianPlaySeconds).toBe(15);
    expect(row.totalPlaySeconds).toBe(630);
  });

  it('groups errors by message, worst first', () => {
    const events = session('buggy', 's1', '2026-07-25T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'error', message: 'x is not a function', msSinceOpen: 1_000 },
      { type: 'error', message: 'x is not a function', msSinceOpen: 2_000 },
      { type: 'error', message: 'out of memory', msSinceOpen: 3_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.errors).toBe(3);
    expect(row.errorSamples).toEqual([
      { message: 'x is not a function', count: 2 },
      { message: 'out of memory', count: 1 },
    ]);
  });

  it('does not let interleaved sessions look like gaps in each other', () => {
    // Two sessions of the same game overlapping in time, events arriving interleaved.
    const a = healthySession('g', 'a', '2026-07-25T10:00:00.000Z', 15);
    const b = healthySession('g', 'b', '2026-07-25T10:00:02.000Z', 15);
    const interleaved = a.flatMap((event, index) => (b[index] ? [event, b[index]] : [event]));

    const [row] = summarizeGameHealth(interleaved);
    expect(row.sessions).toBe(2);
    expect(row.resumeTicksIgnored).toBe(0);
    expect(row.stalledTicks).toBe(0);
  });

  it('ranks erroring and stalling games above merely popular ones', () => {
    const popular = [
      ...healthySession('popular', 's1', '2026-07-25T10:00:00.000Z', 60),
      ...healthySession('popular', 's2', '2026-07-25T11:00:00.000Z', 60),
    ];
    const stalling = session('stalling', 's3', '2026-07-25T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'alive', frames: 0, msSinceOpen: 5_000 },
    ]);
    const broken = session('broken', 's4', '2026-07-25T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'error', message: 'boom', msSinceOpen: 1_000 },
    ]);

    const rows = summarizeGameHealth([...popular, ...stalling, ...broken]);
    expect(rows.map((row) => row.slug)).toEqual(['broken', 'stalling', 'popular']);
  });

  it('returns nothing for no events rather than a row of zeroes', () => {
    expect(summarizeGameHealth([])).toEqual([]);
  });
});

describe('summarizeGameHealth depth signals', () => {
  it('counts outcomes per round and reach per session', () => {
    // One sitting, five rounds: four losses and a win. That is five facts about how hard
    // the game is and one about whether anyone gets that far.
    const events = session('tough', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'lost', msSinceOpen: 10_000 },
      { type: 'end', outcome: 'lost', msSinceOpen: 20_000 },
      { type: 'end', outcome: 'lost', msSinceOpen: 30_000 },
      { type: 'end', outcome: 'lost', msSinceOpen: 40_000 },
      { type: 'end', outcome: 'won', msSinceOpen: 50_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.outcomes).toEqual({ won: 1, lost: 4, quit: 0 });
    expect(row.sessionsWithEnding).toBe(1);
    expect(row.finishRate).toBe(1);
    expect(row.winRate).toBeCloseTo(1 / 5);
  });

  it('measures finish rate against every session, not only the ones that finished', () => {
    const finished = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'won', msSinceOpen: 30_000 },
    ]);
    const abandoned = healthySession('g', 's2', '2026-07-26T11:00:00.000Z', 30);
    const bounced = session('g', 's3', '2026-07-26T12:00:00.000Z', [{ type: 'game_opened', msSinceOpen: 0 }]);

    const [row] = summarizeGameHealth([...finished, ...abandoned, ...bounced]);
    expect(row.sessions).toBe(3);
    expect(row.sessionsWithEnding).toBe(1);
    expect(row.finishRate).toBeCloseTo(1 / 3);
  });

  /**
   * A quit is a statement about attention, which `finishRate` already measures. Folding
   * it into `winRate` would make an abandoned game read as a punishingly hard one.
   */
  it('leaves quits out of the win rate rather than scoring them as losses', () => {
    const events = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'won', msSinceOpen: 10_000 },
      { type: 'end', outcome: 'quit', msSinceOpen: 20_000 },
      { type: 'end', outcome: 'quit', msSinceOpen: 30_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.outcomes).toEqual({ won: 1, lost: 0, quit: 2 });
    expect(row.winRate).toBe(1);
  });

  it('reports no win rate at all when nothing was decided', () => {
    const events = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'quit', msSinceOpen: 10_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    // Null, not 0: nobody losing is not the same as everybody losing.
    expect(row.winRate).toBeNull();
  });

  it('takes each session best before the median, so a chatty score stream does not sink it', () => {
    // Two sessions that report every improvement. Averaging the raw values would mostly
    // measure how often the game calls score(); the best-per-session is the achievement.
    const a = session('scorer', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'score', value: 10, msSinceOpen: 1_000 },
      { type: 'score', value: 40, msSinceOpen: 2_000 },
      { type: 'score', value: 100, msSinceOpen: 3_000 },
    ]);
    const b = session('scorer', 's2', '2026-07-26T11:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'score', value: 10, msSinceOpen: 1_000 },
      { type: 'score', value: 200, msSinceOpen: 2_000 },
    ]);

    const [row] = summarizeGameHealth([...a, ...b]);
    expect(row.medianBestScore).toBe(150);
  });

  it('keeps a session best even when the score goes down again', () => {
    const events = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'score', value: 90, msSinceOpen: 1_000 },
      // A round ended and the next one restarted the counter. The session still reached 90.
      { type: 'end', outcome: 'lost', msSinceOpen: 2_000 },
      { type: 'score', value: 5, msSinceOpen: 3_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.medianBestScore).toBe(90);
  });

  it('treats a zero score as a result rather than a missing one', () => {
    const events = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'score', value: 0, msSinceOpen: 1_000 },
    ]);

    const [row] = summarizeGameHealth(events);
    expect(row.medianBestScore).toBe(0);
  });

  it('counts a landmark once per session however often it is replayed', () => {
    const grinder = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'progress', label: 'level-1', msSinceOpen: 1_000 },
      { type: 'progress', label: 'level-1', msSinceOpen: 2_000 },
      { type: 'progress', label: 'level-1', msSinceOpen: 3_000 },
      { type: 'progress', label: 'level-2', msSinceOpen: 4_000 },
    ]);
    const quitter = session('g', 's2', '2026-07-26T11:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'progress', label: 'level-1', msSinceOpen: 1_000 },
    ]);

    const [row] = summarizeGameHealth([...grinder, ...quitter]);
    // Reach down the funnel, most-reached first — 2 of 2 got to level 1, 1 of 2 past it.
    expect(row.progressLabels).toEqual([
      { label: 'level-1', sessions: 2 },
      { label: 'level-2', sessions: 1 },
    ]);
  });

  /**
   * `progress` is hostile input: a single session could name hundreds of distinct
   * throwaway labels within its 400-event budget and drown out every real landmark in
   * the tally for the whole game. Caps how many *new* labels one session can contribute.
   */
  it('stops one session from flooding the progress tally with distinct labels', () => {
    const flood = session(
      'g',
      'attacker',
      '2026-07-26T10:00:00.000Z',
      Array.from({ length: 100 }, (_, index) => ({
        type: 'progress' as const,
        label: `spam-${index}`,
        msSinceOpen: 1_000 + index,
      })),
    );
    const real = session('g', 'real-player', '2026-07-26T11:00:00.000Z', [
      { type: 'progress', label: 'level-1', msSinceOpen: 1_000 },
    ]);

    const row = summarizeGameHealth([...flood, ...real]).find((game) => game.slug === 'g');

    // The flood contributed at most the per-session cap's worth of distinct labels, not
    // all 100 — and the real player's landmark is still visible among them.
    const totalDistinctLabels = row!.progressLabels.length;
    expect(totalDistinctLabels).toBeLessThanOrEqual(21);
    expect(row!.progressLabels.some((landmark) => landmark.label === 'level-1')).toBe(true);
  });

  it('keeps counting an already-tracked label past the per-session cap', () => {
    const events = session('g', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      ...Array.from({ length: 25 }, (_, index) => ({
        type: 'progress' as const,
        label: `l${index}`,
        msSinceOpen: index + 1,
      })),
      // The 21st distinct label was dropped, but a repeat of one already tracked (l0)
      // still counts — the cap bounds distinct labels, not total progress events.
      { type: 'progress', label: 'l0', msSinceOpen: 100 },
    ]);

    const row = summarizeGameHealth(events).find((game) => game.slug === 'g');
    expect(row!.progressLabels.find((landmark) => landmark.label === 'l0')?.sessions).toBe(1);
  });

  /**
   * Most of the catalog predates the GameKit change that emits endings, and a game whose
   * snapshot never reaches a terminal state still emits none. Those rows must read as
   * "no evidence", which the view renders as a dash — never as a game nobody finishes.
   */
  it('reports absent depth as absent rather than as failure', () => {
    const [row] = summarizeGameHealth(healthySession('quiet', 's1', '2026-07-26T10:00:00.000Z', 60));

    expect(row.outcomes).toEqual({ won: 0, lost: 0, quit: 0 });
    expect(row.sessionsWithEnding).toBe(0);
    expect(row.finishRate).toBe(0);
    expect(row.winRate).toBeNull();
    expect(row.medianBestScore).toBeNull();
    expect(row.progressLabels).toEqual([]);
  });

  it('does not discard an ending reported after a sleep the way it discards a tick', () => {
    const events: TelemetryEvent[] = [
      { slug: 'g', sessionId: 's1', type: 'game_opened', msSinceOpen: 0, at: '2026-07-26T10:00:00.000Z' },
      // Same frozen-monotonic-clock shape that makes an `alive` tick untrustworthy. A win
      // is not a sampling interval, so it survives.
      { slug: 'g', sessionId: 's1', type: 'end', outcome: 'won', msSinceOpen: 5_000, at: '2026-07-26T13:00:00.000Z' },
    ];

    const [row] = summarizeGameHealth(events);
    expect(row.outcomes.won).toBe(1);
    expect(row.finishRate).toBe(1);
  });

  it('keeps depth per game rather than pooling it across the catalog', () => {
    const winner = session('easy', 's1', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'won', msSinceOpen: 10_000 },
    ]);
    const loser = session('brutal', 's2', '2026-07-26T10:00:00.000Z', [
      { type: 'game_opened', msSinceOpen: 0 },
      { type: 'end', outcome: 'lost', msSinceOpen: 10_000 },
    ]);

    const rows = summarizeGameHealth([...winner, ...loser]);
    expect(rows.find((row) => row.slug === 'easy')?.winRate).toBe(1);
    expect(rows.find((row) => row.slug === 'brutal')?.winRate).toBe(0);
  });
});

describe('recentPartitions', () => {
  it('names the last N day partitions, most recent first', () => {
    const now = Date.parse('2026-07-25T09:00:00.000Z');
    expect(recentPartitions(3, now)).toEqual(['2026-07-25', '2026-07-24', '2026-07-23']);
  });

  it('always asks for at least today', () => {
    const now = Date.parse('2026-07-25T09:00:00.000Z');
    expect(recentPartitions(0, now)).toEqual(['2026-07-25']);
  });
});

describe('zone join rate', () => {
  const BASE = '2026-07-30T12:00:00.000Z';

  it('counts a seat that never became a world', () => {
    // The failure with no symptom: the shell falls back to solo play in silence, so a
    // dead host and a healthy one look identical to a player and to every other column
    // on this row. This ratio is the only place the difference shows up.
    const rows = summarizeGameHealth([
      ...session('ember-watch', 'a', BASE, [
        { type: 'game_opened', msSinceOpen: 0 },
        { type: 'zone_link', step: 'admitted', msSinceOpen: 200 },
        { type: 'zone_link', step: 'joined', msSinceOpen: 900 },
      ]),
      ...session('ember-watch', 'b', BASE, [
        { type: 'game_opened', msSinceOpen: 0 },
        { type: 'zone_link', step: 'admitted', msSinceOpen: 200 },
      ]),
    ]);

    expect(rows[0]).toMatchObject({ zoneAdmitted: 2, zoneJoined: 1, zoneJoinRate: 0.5 });
  });

  it('reports no evidence rather than zero for a game with no zone', () => {
    // Absence of evidence renders as absence — the same rule finishRate follows. A game
    // that never asked for a zone must not read like one whose zone is broken.
    const rows = summarizeGameHealth(session('paddle-duel', 'a', BASE, [{ type: 'game_opened', msSinceOpen: 0 }]));
    expect(rows[0].zoneJoinRate).toBeNull();
    expect(rows[0].zoneAdmitted).toBe(0);
  });

  it('cannot report more joins than seats, whatever the network lost', () => {
    // Telemetry is best-effort and batched: a session can land `joined` while the request
    // carrying its `admitted` was dropped. Counted independently that session would be in
    // the numerator and missing from the denominator, and the column would show a join
    // rate above 100% — a ratio exceeding its own maximum discredits the metric more than
    // the gap it exists to report.
    const rows = summarizeGameHealth([
      ...session('ember-watch', 'a', BASE, [
        { type: 'game_opened', msSinceOpen: 0 },
        { type: 'zone_link', step: 'admitted', msSinceOpen: 200 },
        { type: 'zone_link', step: 'joined', msSinceOpen: 900 },
      ]),
      // The `admitted` for this one never arrived.
      ...session('ember-watch', 'b', BASE, [
        { type: 'game_opened', msSinceOpen: 0 },
        { type: 'zone_link', step: 'joined', msSinceOpen: 900 },
      ]),
    ]);

    expect(rows[0]).toMatchObject({ zoneAdmitted: 1, zoneJoined: 1, zoneJoinRate: 1 });
  });
});
