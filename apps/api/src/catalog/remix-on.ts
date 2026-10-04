import type { Store } from '../platform/store.js';

const REMIX_ON_TTL_MS = 60_000;

const caches = new WeakMap<Store, { slugs: Set<string>; expiresAt: number }>();

// Slugs whose author or an admin turned remix on, cached briefly.
export async function remixOnSlugs(store: Store, now: number = Date.now()): Promise<Set<string>> {
  const cached = caches.get(store);
  if (cached && cached.expiresAt > now) return cached.slugs;
  try {
    const slugs = new Set(await store.listRemixOnSlugs());
    caches.set(store, { slugs, expiresAt: now + REMIX_ON_TTL_MS });
    return slugs;
  } catch {
    // A failed read must not break the catalog; the server still enforces.
    return cached?.slugs ?? new Set();
  }
}

export function invalidateRemixOnSlugs(store: Store): void {
  caches.delete(store);
}

// Adds `remixOn: true` to entries whose remix switch is on.
export async function attachRemixOn<T extends { slug: string }>(
  entries: T[],
  store: Store | null | undefined,
  now: number = Date.now(),
): Promise<Array<T & { remixOn?: true }>> {
  if (!store) return entries;
  const on = await remixOnSlugs(store, now);
  if (on.size === 0) return entries;
  return entries.map((entry) => (on.has(entry.slug) ? { ...entry, remixOn: true as const } : entry));
}
