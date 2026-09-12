import { describe, expect, it } from 'vitest';
import {
  createMintBudgetState,
  DEFAULT_MINT_BUDGET,
  recordMint,
  resolveMintBudget,
  utcDay,
} from './media-mint-budget.js';

const NOON = Date.parse('2026-09-12T12:00:00Z');

describe('bounding what one address can mint in a day', () => {
  it('allows up to the per-IP ceiling and refuses past it', () => {
    let state = createMintBudgetState(utcDay(NOON));
    const limits = { perIpPerDay: 3, perInstancePerDay: 100 };

    for (let i = 0; i < 3; i++) {
      const result = recordMint(state, '1.2.3.4', NOON, limits);
      state = result.state;
      expect(result.decision).toBe('allowed');
    }

    expect(recordMint(state, '1.2.3.4', NOON, limits).decision).toBe('ip-exhausted');
  });

  it('keeps one address from spending what another was owed', () => {
    let state = createMintBudgetState(utcDay(NOON));
    const limits = { perIpPerDay: 1, perInstancePerDay: 100 };

    state = recordMint(state, 'noisy', NOON, limits).state;
    expect(recordMint(state, 'noisy', NOON, limits).decision).toBe('ip-exhausted');
    expect(recordMint(state, 'quiet', NOON, limits).decision).toBe('allowed');
  });

  // Per-IP alone multiplies by however many addresses exist.
  it('refuses everyone once this instance has spent its day', () => {
    let state = createMintBudgetState(utcDay(NOON));
    const limits = { perIpPerDay: 100, perInstancePerDay: 2 };

    state = recordMint(state, 'a', NOON, limits).state;
    state = recordMint(state, 'b', NOON, limits).state;

    expect(recordMint(state, 'c', NOON, limits).decision).toBe('instance-exhausted');
  });

  it('starts over when the UTC day turns', () => {
    let state = createMintBudgetState(utcDay(NOON));
    const limits = { perIpPerDay: 1, perInstancePerDay: 10 };
    state = recordMint(state, '1.2.3.4', NOON, limits).state;
    expect(recordMint(state, '1.2.3.4', NOON, limits).decision).toBe('ip-exhausted');

    const nextDay = Date.parse('2026-09-13T00:00:01Z');
    const result = recordMint(state, '1.2.3.4', nextDay, limits);

    expect(result.decision).toBe('allowed');
    // The rollover also stops the map growing forever.
    expect(result.state.perIp.size).toBe(1);
  });

  it('reads ceilings from the environment, and ignores nonsense', () => {
    expect(resolveMintBudget({ MEDIA_DAILY_MINTS_PER_IP: '10', MEDIA_DAILY_MINTS_PER_INSTANCE: '20' })).toEqual({
      perIpPerDay: 10,
      perInstancePerDay: 20,
    });
    expect(resolveMintBudget({ MEDIA_DAILY_MINTS_PER_IP: '0', MEDIA_DAILY_MINTS_PER_INSTANCE: 'lots' })).toEqual(
      DEFAULT_MINT_BUDGET,
    );
    expect(resolveMintBudget({})).toEqual(DEFAULT_MINT_BUDGET);
  });
});
