export type CachedAssembledGame = { slug: string; title: string; html: string };

export const GAME_CACHE_TTL_MS = 5 * 60_000;
// Caps RAM: ~9 near-limit games on a 1 GiB instance.
export const GAME_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const GAME_CACHE_MAX_ENTRIES = 32;

function payloadBytes(value: CachedAssembledGame): number {
  return Buffer.byteLength(value.html) + Buffer.byteLength(value.title) + Buffer.byteLength(value.slug);
}

export function createAssembledGameCache(options?: { ttlMs?: number; maxBytes?: number; maxEntries?: number }) {
  const ttlMs = options?.ttlMs ?? GAME_CACHE_TTL_MS;
  const maxBytes = options?.maxBytes ?? GAME_CACHE_MAX_BYTES;
  const maxEntries = options?.maxEntries ?? GAME_CACHE_MAX_ENTRIES;
  const entries = new Map<string, { expiresAt: number; bytes: number; value: CachedAssembledGame }>();

  function sweep(now: number): void {
    for (const [slug, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(slug);
    }
  }

  function byteSize(): number {
    let total = 0;
    for (const entry of entries.values()) total += entry.bytes;
    return total;
  }

  function evictUntilFit(bytes: number): void {
    while (entries.size > 0 && (entries.size >= maxEntries || byteSize() + bytes > maxBytes)) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    get(slug: string, now: number): CachedAssembledGame | null {
      sweep(now);
      const entry = entries.get(slug);
      if (!entry) return null;
      entries.delete(slug);
      entries.set(slug, entry);
      return entry.value;
    },
    set(slug: string, value: CachedAssembledGame, now: number): void {
      sweep(now);
      const bytes = payloadBytes(value);
      entries.delete(slug);
      if (bytes > maxBytes) return;
      evictUntilFit(bytes);
      if (byteSize() + bytes > maxBytes) return;
      entries.set(slug, { value, bytes, expiresAt: now + ttlMs });
    },
    invalidate(slug: string): void {
      entries.delete(slug);
    },
    size(): number {
      return entries.size;
    },
    byteSize,
  };
}
