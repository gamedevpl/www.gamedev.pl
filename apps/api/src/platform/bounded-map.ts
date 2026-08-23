/**
 * Insertion-ordered maps with a hard entry cap, for the per-caller bookkeeping the
 * unauthenticated intake endpoints keep in memory.
 *
 * The pattern this replaces looked bounded but was not: a lazy sweep that ran only
 * above N entries and deleted only entries idle for hours. Under a stream of
 * never-before-seen keys — which is exactly what a client-supplied `visitId` or
 * `sessionId` is — nothing was ever old enough to delete, so every request past the
 * threshold paid for a full scan that freed nothing while the map kept growing. The
 * work per request rose with the size of the map, which is the wrong direction for a
 * surface anyone on the internet can reach.
 *
 * A cap plus LRU eviction fixes both halves: memory stops at a known ceiling, and the
 * cost per request is constant.
 */

/**
 * Records `key` → `value`, evicting least-recently-used entries past `maxEntries`.
 *
 * The delete-then-set is load-bearing. `Map.set` on an existing key keeps its original
 * insertion position, so without it the *busiest* keys drift to the front and get
 * evicted first — the opposite of what a cache wants.
 */
export function rememberBounded<K, V>(map: Map<K, V>, key: K, value: V, maxEntries: number): void {
  map.delete(key);
  map.set(key, value);

  while (map.size > maxEntries) {
    // `.done` rather than `value === undefined`: undefined is a legal key, and an
    // empty map must end the loop rather than delete nothing forever.
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}
