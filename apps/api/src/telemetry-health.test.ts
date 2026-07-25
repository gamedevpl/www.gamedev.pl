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
