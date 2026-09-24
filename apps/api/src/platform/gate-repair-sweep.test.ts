import { describe, expect, it } from 'vitest';
import { isSweepActive, type SweepScopeRecord } from './sweep-scope.js';

describe('gate repair sweep', () => {
  it('keeps an unclaimed platform failure active until its repair starts', () => {
    const red: SweepScopeRecord = {
      lastNotifiedStatus: 'needs_changes',
      state: 'needs_changes',
      builder: 'platform',
      dispatch: { refs: ['session-1'] },
      roundGeneration: 2,
      transitions: [{ reason: 'gate_red' }],
    };
    expect(isSweepActive(red)).toBe(true);
    expect(isSweepActive({ ...red, gateRepair: { roundGeneration: 2 } })).toBe(false);
    expect(isSweepActive({ ...red, builder: 'self' })).toBe(false);
  });
});
