// Media as signed redirects, not bytes. See docs/deployment.md.

import { createGcsObjectStore, type GcsObjectStore } from './gcs-sign.js';

// Media is unauthenticated anyway; short TTLs only churn caches.
export const MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;

// Video carries the bytes, and a live link is pullable by anyone.
export const MEDIA_VIDEO_URL_TTL_SECONDS = 30 * 60;

// One window of images. Quantised instant, so every visitor gets one URL.
export const MEDIA_URL_ANCHOR_SECONDS = 24 * 60 * 60;

// Two windows, so a URL minted late still lives a full one.
export const MEDIA_ANCHORED_TTL_SECONDS = 2 * MEDIA_URL_ANCHOR_SECONDS;

export interface MediaUrlPolicy {
  ttlSeconds: number;
  // Zero signs at the current instant, as video wants.
  anchorSeconds: number;
}

// Video stays unanchored: shareable long links are what its TTL guards against.
export function mediaUrlPolicy(filename: string): MediaUrlPolicy {
  if (filename.endsWith('.mp4')) {
    return { ttlSeconds: MEDIA_VIDEO_URL_TTL_SECONDS, anchorSeconds: 0 };
  }
  return { ttlSeconds: MEDIA_ANCHORED_TTL_SECONDS, anchorSeconds: MEDIA_URL_ANCHOR_SECONDS };
}

export function mediaUrlTtlSeconds(filename: string): number {
  return mediaUrlPolicy(filename).ttlSeconds;
}

// Start of the window nowMs falls in, epoch milliseconds.
export function anchorStart(nowMs: number, anchorSeconds: number): number {
  const windowMs = anchorSeconds * 1000;
  return Math.floor(nowMs / windowMs) * windowMs;
}

// Seconds until the roll hands out a different URL.
export function anchorRemainingSeconds(nowMs: number, anchorSeconds: number): number {
  if (anchorSeconds <= 0) return 0;
  const windowMs = anchorSeconds * 1000;
  return Math.max(1, Math.ceil((anchorStart(nowMs, anchorSeconds) + windowMs - nowMs) / 1000));
}

// How long the redirect itself may be cached.
export function redirectMaxAge(policy: MediaUrlPolicy, nowMs: number): number {
  if (policy.anchorSeconds <= 0) return Math.floor(policy.ttlSeconds / 2);
  return anchorRemainingSeconds(nowMs, policy.anchorSeconds);
}

export function mediaRedirectMaxAgeSeconds(filename: string, nowMs: number): number {
  return redirectMaxAge(mediaUrlPolicy(filename), nowMs);
}

export interface MediaUrlSigner {
  // Null when absent: a redirect cannot fall through.
  urlFor(object: string, ttlSeconds?: number, anchorSeconds?: number): Promise<string | null>;
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
    async urlFor(object: string, requestedTtl?: number, anchorSeconds = 0): Promise<string | null> {
      const ttl = requestedTtl ?? ttlSeconds;
      const currentTime = now();
      const anchored = anchorSeconds > 0;
      // Window in the key, so a roll re-mints.
      const signedAtMs = anchored ? anchorStart(currentTime, anchorSeconds) : currentTime;
      const key = anchored ? `${object}#${ttl}#${signedAtMs}` : `${object}#${ttl}`;

      const cached = cache.get(key);
      // Anchored URLs outlive their window, so age cannot retire them.
      if (cached && (anchored || currentTime - cached.signedAt < (ttl * 1000) / 2)) return cached.url;

      // Probed only when minting; a cached URL proves existence.
      if (!(await options.store.objectExists(object))) return null;

      const url = await options.store.signReadUrl(object, ttl, anchored ? signedAtMs : undefined);
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
