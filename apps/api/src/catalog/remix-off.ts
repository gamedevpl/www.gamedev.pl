import type { Store } from '../platform/store.js';

const REMIX_OFF_TTL_MS = 60_000;

const caches = new WeakMap<Store, { slugs: Set<string>; expiresAt: number }>();

// Slugs whose author turned remix off, cached briefly per store.
export async function remixOffSlugs(store: Store, now: number = Date.now()): Promise<Set<string>> {
  const cached = caches.get(store);
  if (cached && cached.expiresAt > now) return cached.slugs;
  try {
    const slugs = new Set(await store.listRemixOffSlugs());
    caches.set(store, { slugs, expiresAt: now + REMIX_OFF_TTL_MS });
    return slugs;
  } catch {
    // A failed read must not break the catalog; the server still enforces.
    return cached?.slugs ?? new Set();
  }
}

export function invalidateRemixOffSlugs(store: Store): void {
  caches.delete(store);
}

// Adds `remixOff: true` to entries whose remix switch is off.
export async function attachRemixOff<T extends { slug: string }>(
  entries: T[],
  store: Store | null | undefined,
  now: number = Date.now(),
): Promise<Array<T & { remixOff?: true }>> {
  if (!store) return entries;
  const off = await remixOffSlugs(store, now);
  if (off.size === 0) return entries;
  return entries.map((entry) => (off.has(entry.slug) ? { ...entry, remixOff: true as const } : entry));
}
