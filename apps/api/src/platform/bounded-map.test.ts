import { describe, expect, it } from 'vitest';
import { rememberBounded } from './bounded-map.js';

describe('rememberBounded', () => {
  it('never grows past the cap, however many distinct keys arrive', () => {
    const map = new Map<string, number>();
    for (let index = 0; index < 10_000; index += 1) {
      rememberBounded(map, `key-${index}`, index, 100);
    }
    expect(map.size).toBe(100);
  });

  it('evicts the least recently used key, not the oldest insertion', () => {
    // The distinction the delete-then-set exists for: `first` is the oldest *insertion*
    // but the most recent *use*, so it must outlive a key that has sat untouched.
    const map = new Map<string, number>();
    rememberBounded(map, 'first', 1, 3);
    rememberBounded(map, 'second', 2, 3);
    rememberBounded(map, 'third', 3, 3);

    rememberBounded(map, 'first', 10, 3); // touched — moves to the back
    rememberBounded(map, 'fourth', 4, 3); // pushes one out

    expect(map.has('first')).toBe(true);
    expect(map.has('second')).toBe(false); // untouched the longest
    expect([...map.keys()]).toEqual(['third', 'first', 'fourth']);
  });

  it('updates in place without growing', () => {
    const map = new Map<string, number>();
    rememberBounded(map, 'same', 1, 10);
    rememberBounded(map, 'same', 2, 10);

    expect(map.size).toBe(1);
    expect(map.get('same')).toBe(2);
  });

  it('handles a cap of one', () => {
    const map = new Map<string, number>();
    rememberBounded(map, 'a', 1, 1);
    rememberBounded(map, 'b', 2, 1);

    expect([...map.entries()]).toEqual([['b', 2]]);
  });
});
