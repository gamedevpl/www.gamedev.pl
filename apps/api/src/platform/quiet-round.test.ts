import { afterEach, describe, expect, it } from 'vitest';
import { lastRoundActivityAt, quietRoundDays, shouldAutoAbandonQuietRound } from './quiet-round.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-07-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('quietRoundDays', () => {
  afterEach(() => {
    delete process.env.QUIET_ROUND_DAYS;
  });

  it('defaults to 14 and refuses nonsense', () => {
    expect(quietRoundDays()).toBe(14);
    process.env.QUIET_ROUND_DAYS = '7.9';
    expect(quietRoundDays()).toBe(7);
    process.env.QUIET_ROUND_DAYS = '0';
    expect(quietRoundDays()).toBe(14);
    process.env.QUIET_ROUND_DAYS = 'soon';
    expect(quietRoundDays()).toBe(14);
  });
});

describe('lastRoundActivityAt', () => {
  it('reads the newest stamp anyone left on the round', () => {
    expect(lastRoundActivityAt({ createdAt: ago(20 * DAY), lastAgentSignalAt: ago(3 * DAY) })).toBe(
      Date.parse(ago(3 * DAY)),
    );
    expect(
      lastRoundActivityAt({
        createdAt: ago(20 * DAY),
        stateSince: ago(10 * DAY),
        transitions: [{ to: 'needs_changes', at: ago(5 * DAY), by: 'gate' }],
      }),
    ).toBe(Date.parse(ago(5 * DAY)));
  });

  it('falls back to creation stamps only when the job never lived', () => {
    // The store stamps createdAt with the wall clock; a lived round must not read newer than its state.
    expect(lastRoundActivityAt({ createdAt: ago(0), roundStartedAt: ago(0), stateSince: ago(15 * DAY) })).toBe(
      Date.parse(ago(15 * DAY)),
    );
    expect(lastRoundActivityAt({ createdAt: ago(9 * DAY), roundStartedAt: ago(8 * DAY) })).toBe(
      Date.parse(ago(8 * DAY)),
    );
    expect(lastRoundActivityAt({ createdAt: 'garbage' })).toBe(-Infinity);
  });
});

describe('shouldAutoAbandonQuietRound', () => {
  it('closes a round quiet from every side for the window, whoever was last to speak', () => {
    const quiet = { lastActivityAt: Date.parse(ago(15 * DAY)), now: NOW, quietDays: 14 };
    expect(shouldAutoAbandonQuietRound({ state: 'needs_changes', ...quiet })).toBe(true);
    expect(shouldAutoAbandonQuietRound({ state: 'building', ...quiet })).toBe(true);
    expect(shouldAutoAbandonQuietRound({ state: 'queued', ...quiet })).toBe(true);
    // A legacy record with no job state is judged by its timestamps alone.
    expect(shouldAutoAbandonQuietRound({ ...quiet })).toBe(true);
    expect(
      shouldAutoAbandonQuietRound({
        state: 'needs_changes',
        lastActivityAt: Date.parse(ago(13 * DAY)),
        now: NOW,
        quietDays: 14,
      }),
    ).toBe(false);
  });

  it('never closes a round that is waiting on us, or one already closed', () => {
    const quiet = { lastActivityAt: Date.parse(ago(30 * DAY)), now: NOW, quietDays: 14 };
    // In review and mid-publish are our queue, not the creator's silence.
    expect(shouldAutoAbandonQuietRound({ state: 'ready_for_review', ...quiet })).toBe(false);
    expect(shouldAutoAbandonQuietRound({ state: 'publishing', ...quiet })).toBe(false);
    expect(shouldAutoAbandonQuietRound({ state: 'published', ...quiet })).toBe(false);
    expect(shouldAutoAbandonQuietRound({ state: 'building', abandonedAt: ago(DAY), ...quiet })).toBe(false);
    expect(shouldAutoAbandonQuietRound({ state: 'building', lastActivityAt: NaN, now: NOW, quietDays: 14 })).toBe(
      false,
    );
  });
});
