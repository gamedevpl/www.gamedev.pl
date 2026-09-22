import { describe, expect, it } from 'vitest';
import { activeShards, COUNTER_SHARDS, shardCapacity } from './quota-shards.js';

function totalCapacity(limit: number): number {
  let total = 0;
  for (let shard = 0; shard < COUNTER_SHARDS; shard++) total += shardCapacity(limit, shard);
  return total;
}

describe('counter shard arithmetic', () => {
  it('sums to the configured cap, which is what the file header promises', () => {
    for (const limit of [0, 1, 7, 9, 10, 11, 45, 100, 399, 20_000]) {
      expect(totalCapacity(limit)).toBe(limit);
    }
  });

  it('never hands a shard more than its share, so no single shard can absorb the day', () => {
    for (const limit of [1, 7, 45, 100]) {
      for (let shard = 0; shard < COUNTER_SHARDS; shard++) {
        expect(shardCapacity(limit, shard)).toBeLessThanOrEqual(Math.ceil(limit / COUNTER_SHARDS));
      }
    }
  });

  it('offers only the shards that actually have a slot', () => {
    // Guards a cap of 1 refusing 90% of requests at zero usage.
    expect(activeShards(0)).toBe(0);
    expect(activeShards(1)).toBe(1);
    expect(activeShards(7)).toBe(7);
    expect(activeShards(10)).toBe(COUNTER_SHARDS);
    expect(activeShards(20_000)).toBe(COUNTER_SHARDS);
  });

  it('keeps every offered shard non-empty', () => {
    for (const limit of [1, 3, 9, 10, 45]) {
      for (let shard = 0; shard < activeShards(limit); shard++) {
        expect(shardCapacity(limit, shard)).toBeGreaterThan(0);
      }
    }
  });
});
