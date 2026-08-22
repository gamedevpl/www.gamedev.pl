import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS_PER_ZONE, MAX_STATE_BYTES, RESERVED_EVENT_KINDS, TICK_HZ_VALUES } from './zone-contract.js';

describe('zone sim contract', () => {
  it('pins the values the games repo declares', () => {
    expect(TICK_HZ_VALUES).toEqual([5, 10, 15, 20]);
    expect(MAX_PLAYERS_PER_ZONE).toBe(16);
    expect(MAX_STATE_BYTES).toBe(192 * 1024);
    expect(RESERVED_EVENT_KINDS).toEqual(['join', 'leave']);
  });
});
