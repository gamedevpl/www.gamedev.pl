import { describe, expect, it } from 'vitest';

import { isRoundOpen, isSweepActive, type SweepScopeRecord } from './sweep-scope.js';

describe('isSweepActive', () => {
  it('keeps reaching a delivery the gate still owes a verdict on', () => {
    // An earlier red gate hid later crashed deliveries from the sweep.
    expect(isSweepActive({ lastNotifiedStatus: 'needs_changes', state: 'submitted' })).toBe(true);
    expect(isSweepActive({ lastNotifiedStatus: 'needs_changes', state: 'submitted' })).toBe(true);
  });

  it('does not let gate_crashed disarm the detector that wrote it', () => {
    // gate_crashed writes needs_changes, so it used to fire once per job.
    expect(isSweepActive({ lastNotifiedStatus: 'needs_changes', state: 'submitted' })).toBe(true);
  });

  it('still skips a job resting in needs_changes', () => {
    expect(isSweepActive({ lastNotifiedStatus: 'needs_changes', state: 'needs_changes' })).toBe(false);
    expect(isSweepActive({ lastNotifiedStatus: 'needs_changes' })).toBe(false);
  });

  it('still skips published and abandoned', () => {
    expect(isSweepActive({ lastNotifiedStatus: 'published' })).toBe(false);
    // Abandoned is a decision, not a phase.
    expect(isSweepActive({ abandonedAt: '2026-08-21T00:00:00.000Z', state: 'submitted' })).toBe(false);
    expect(isSweepActive({ lastNotifiedStatus: 'published', state: 'submitted' })).toBe(false);
  });

  it('keeps ordinary in-flight jobs', () => {
    expect(isSweepActive({ lastNotifiedStatus: 'building', state: 'building' })).toBe(true);
    expect(isSweepActive({})).toBe(true);
  });
});

describe('isRoundOpen', () => {
  it('closes a job both signals agree has shipped', () => {
    expect(isRoundOpen({ lastNotifiedStatus: 'published', lastStatus: 'published' })).toBe(false);
    expect(isRoundOpen({ abandonedAt: '2026-08-21T00:00:00.000Z' })).toBe(false);
  });

  it('reopens a published game the moment an improve round is derived', () => {
    // lastNotifiedStatus lags a round behind: the notification has not fired yet.
    expect(isRoundOpen({ lastNotifiedStatus: 'published', lastStatus: 'building' })).toBe(true);
  });

  it('keeps a job the sweep has notified published but never derived', () => {
    expect(isRoundOpen({ lastNotifiedStatus: 'published' })).toBe(false);
    expect(isRoundOpen({ lastStatus: 'published' })).toBe(true);
  });

  it('keeps everything still moving, including a job with no status at all', () => {
    expect(isRoundOpen({})).toBe(true);
    expect(isRoundOpen({ lastNotifiedStatus: 'needs_changes' })).toBe(true);
    expect(isRoundOpen({ lastNotifiedStatus: 'building', lastStatus: 'building' })).toBe(true);
  });

  it('never hides a job the sweep still wants — the flag is only ever a prefilter', () => {
    // A stale false would drop a build from the sweep forever.
    const statuses = [undefined, 'queued', 'building', 'in_review', 'publishing', 'published', 'needs_changes'] as const;
    const states = [undefined, 'building', 'submitted', 'needs_changes', 'published'] as const;
    for (const lastNotifiedStatus of statuses) {
      for (const lastStatus of statuses) {
        for (const state of states) {
          for (const abandonedAt of [undefined, '2026-08-21T00:00:00.000Z']) {
            const record = { lastNotifiedStatus, lastStatus, state, abandonedAt } as SweepScopeRecord;
            if (isSweepActive(record)) expect(isRoundOpen(record)).toBe(true);
          }
        }
      }
    }
  });
});
