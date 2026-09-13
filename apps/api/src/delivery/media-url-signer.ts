// Media as signed redirects, not bytes. See docs/deployment.md.

import { createGcsObjectStore, type GcsObjectStore } from './gcs-sign.js';

// Media is unauthenticated anyway; short TTLs only churn caches.
export const MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

// Video carries the bytes, and a live link is pullable by anyone.
export const MEDIA_VIDEO_URL_TTL_SECONDS = 30 * 60;

export function mediaUrlTtlSeconds(filename: string): number {
  return filename.endsWith('.mp4') ? MEDIA_VIDEO_URL_TTL_SECONDS : MEDIA_URL_TTL_SECONDS;
}

export interface MediaUrlSigner {
  // Null when absent: a redirect cannot fall through.
  urlFor(object: string, ttlSeconds?: number): Promise<string | null>;
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
  const cache = new Map<string, { url: string; signedAt: number }>();

  return {
    async urlFor(object: string, requestedTtl?: number): Promise<string | null> {
      const ttl = requestedTtl ?? ttlSeconds;
      const key = `${object}#${ttl}`;
      const cached = cache.get(key);
      const currentTime = now();
      // Half of this URL's life, not the default one's.
      if (cached && currentTime - cached.signedAt < (ttl * 1000) / 2) return cached.url;

      // Probed only when minting; a cached URL proves existence.
      if (!(await options.store.objectExists(object))) return null;

      const url = await options.store.signReadUrl(object, ttl);
      if (cache.size >= maxCached) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { url, signedAt: currentTime });
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
