import { describe, expect, it } from 'vitest';
import { gatedPollDelayMs, idleFloorMs, IDLE_AFTER_MS } from './pollGating.js';
import { ACTIVE_POLL_MS, pollDelayMs } from './studioStatusPoll.js';

describe('idleFloorMs', () => {
  it('imposes nothing while the tab is being touched', () => {
    expect(idleFloorMs(0)).toBe(0);
    expect(idleFloorMs(IDLE_AFTER_MS - 1)).toBe(0);
  });

  it('widens in steps and then stops widening', () => {
    expect(idleFloorMs(IDLE_AFTER_MS)).toBe(10_000);
    expect(idleFloorMs(5 * 60_000)).toBe(10_000);
    expect(idleFloorMs(10 * 60_000)).toBe(30_000);
    expect(idleFloorMs(30 * 60_000)).toBe(60_000);
    expect(idleFloorMs(8 * 60 * 60_000)).toBe(60_000);
  });

  it('imposes nothing on an unusable idle age', () => {
    for (const age of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(idleFloorMs(age)).toBe(0);
    }
  });
});

describe('gatedPollDelayMs', () => {
  it('leaves an actively watched round at the cadence it asked for', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: false, msSinceInteraction: 0, serverFloorMs: 3_000 })).toBe(
      3_000,
    );
  });

  it('stops entirely while the tab is hidden', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: true, msSinceInteraction: 0 })).toBeNull();
  });

  it('keeps an opt-out opted out, whatever the floors say', () => {
    expect(
      gatedPollDelayMs({ wantedMs: null, hidden: false, msSinceInteraction: 60 * 60_000, serverFloorMs: 60_000 }),
    ).toBeNull();
  });

  it('slows a visible but untouched tab', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: false, msSinceInteraction: 11 * 60_000 })).toBe(30_000);
  });

  it('honours the server floor even on a tab being actively used', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: false, msSinceInteraction: 0, serverFloorMs: 30_000 })).toBe(
      30_000,
    );
  });

  it('takes the slowest of the three rather than the newest', () => {
    expect(
      gatedPollDelayMs({ wantedMs: 10_000, hidden: false, msSinceInteraction: 31 * 60_000, serverFloorMs: 3_000 }),
    ).toBe(60_000);
  });

  it('ignores a missing or nonsensical server floor instead of stalling', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: false, msSinceInteraction: 0 })).toBe(3_000);
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: false, msSinceInteraction: 0, serverFloorMs: Number.NaN })).toBe(
      3_000,
    );
  });
});

describe('cadence while a concept proposal is drawing', () => {
  it('skips the idle floor so the card lands promptly', () => {
    const idle = { wantedMs: 3_000, hidden: false, msSinceInteraction: 11 * 60_000 };
    expect(gatedPollDelayMs(idle)).toBe(30_000);
    expect(gatedPollDelayMs({ ...idle, dreaming: true })).toBe(3_000);
  });

  it('still stops on a hidden tab and honours the server floor', () => {
    expect(gatedPollDelayMs({ wantedMs: 3_000, hidden: true, msSinceInteraction: 0, dreaming: true })).toBeNull();
    const floored = { wantedMs: 3_000, hidden: false, msSinceInteraction: 0, serverFloorMs: 10_000, dreaming: true };
    expect(gatedPollDelayMs(floored)).toBe(10_000);
  });

  it('asks for the active cadence after a green preview', () => {
    expect(pollDelayMs('in_review')).toBeGreaterThan(ACTIVE_POLL_MS);
    expect(pollDelayMs('in_review', undefined, 'ready_for_review', true)).toBe(ACTIVE_POLL_MS);
    // A card may still post after publication; keep fetching until it lands.
    expect(pollDelayMs('published', undefined, undefined, true)).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs('published')).toBeNull();
    expect(pollDelayMs('needs_changes', undefined, undefined, true)).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs('abandoned', undefined, undefined, true)).toBeNull();
  });
});
