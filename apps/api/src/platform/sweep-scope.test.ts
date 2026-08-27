import { describe, expect, it } from 'vitest';

import { isSweepActive } from './sweep-scope.js';

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
