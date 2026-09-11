import { describe, expect, it } from 'vitest';
import { createAssembledGameCache } from './assembled-game-cache.js';

function game(slug: string, html: string) {
  return { slug, title: slug, html };
}

describe('assembled game cache', () => {
  it('drops an expired entry without waiting for that slug again', () => {
    const cache = createAssembledGameCache({ ttlMs: 10, maxEntries: 8, maxBytes: 10_000 });
    cache.set('a', game('a', 'one'), 0);
    expect(cache.get('b', 11)).toBeNull();
    expect(cache.size()).toBe(0);
  });

  it('evicts the least recently used slug when the entry cap is hit', () => {
    const cache = createAssembledGameCache({ ttlMs: 1_000, maxEntries: 2, maxBytes: 10_000 });
    cache.set('a', game('a', 'one'), 0);
    cache.set('b', game('b', 'two'), 0);
    expect(cache.get('a', 1)?.html).toBe('one');
    cache.set('c', game('c', 'three'), 1);
    expect(cache.get('b', 2)).toBeNull();
    expect(cache.get('a', 2)?.html).toBe('one');
    expect(cache.get('c', 2)?.html).toBe('three');
  });

  it('evicts older documents when a large payload would exceed the byte cap', () => {
    const cache = createAssembledGameCache({ ttlMs: 1_000, maxEntries: 8, maxBytes: 20 });
    cache.set('a', game('a', '1234567890'), 0);
    cache.set('b', game('b', '1234567890'), 0);
    expect(cache.size()).toBe(1);
    expect(cache.get('a', 1)).toBeNull();
    expect(cache.get('b', 1)?.html).toBe('1234567890');
  });

  it('refuses to store a single document larger than the byte cap', () => {
    const cache = createAssembledGameCache({ ttlMs: 1_000, maxEntries: 8, maxBytes: 4 });
    cache.set('huge', game('huge', '1234567890'), 0);
    expect(cache.size()).toBe(0);
  });

  it('invalidate drops a slug without waiting for expiry', () => {
    const cache = createAssembledGameCache({ ttlMs: 1_000, maxEntries: 8, maxBytes: 10_000 });
    cache.set('a', game('a', 'one'), 0);
    cache.invalidate('a');
    expect(cache.get('a', 1)).toBeNull();
    expect(cache.size()).toBe(0);
  });
});
