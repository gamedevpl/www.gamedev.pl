// Media as signed redirects, not bytes. See docs/deployment.md.

import { createGcsObjectStore, type GcsObjectStore } from './gcs-sign.js';

// Media is unauthenticated anyway; short TTLs only churn caches.
export const MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

export interface MediaUrlSigner {
  // Null when absent: a redirect cannot fall through.
  urlFor(object: string): Promise<string | null>;
}

export function createMediaUrlSigner(options: {
  store: Pick<GcsObjectStore, 'signReadUrl' | 'objectExists'>;
  ttlSeconds?: number;
  now?: () => number;
  maxCached?: number;
}): MediaUrlSigner {
  const ttlSeconds = options.ttlSeconds ?? MEDIA_URL_TTL_SECONDS;
  const now = options.now ?? Date.now;
  const maxCached = options.maxCached ?? 500;

  // Half-life, so a late follower still has download time.
  const reuseWindowMs = (ttlSeconds * 1000) / 2;
  const cache = new Map<string, { url: string; signedAt: number }>();

  return {
    async urlFor(object: string): Promise<string | null> {
      const cached = cache.get(object);
      const currentTime = now();
      if (cached && currentTime - cached.signedAt < reuseWindowMs) return cached.url;

      // Probed only when minting; a cached URL proves existence.
      if (!(await options.store.objectExists(object))) return null;

      const url = await options.store.signReadUrl(object, ttlSeconds);
      if (cache.size >= maxCached) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(object, { url, signedAt: currentTime });
      return url;
    },
  };
}

// Signs wherever snapshots live; no bucket, nothing to sign.
export function createMediaUrlSignerFromEnv(env: NodeJS.ProcessEnv = process.env): MediaUrlSigner | null {
  const bucket = env.GAMES_SNAPSHOT_BUCKET?.trim();
  if (!bucket) return null;

  // Signs as the runtime account, like kit downloads.
  return createMediaUrlSigner({ store: createGcsObjectStore({ bucket }) });
}

// Platform-made games: media in the store bucket, and the heavier half.
export function createStoreMediaUrlSignerFromEnv(env: NodeJS.ProcessEnv = process.env): MediaUrlSigner | null {
  const bucket = env.GAMES_STORE_BUCKET?.trim();
  if (!bucket) return null;
  return createMediaUrlSigner({ store: createGcsObjectStore({ bucket }) });
}
