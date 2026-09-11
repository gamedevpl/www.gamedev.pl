/**
 * Answers the media route with a short-lived Cloud Storage URL instead of the bytes.
 *
 * Why: Firebase Hosting rewrites `**` to Cloud Run, and every byte the origin returns is
 * billed as Hosting egress against a 360 MB/day free tier. Media is the bulk of it — a
 * gameplay capture is ~662 KB against a ~282 KB bundle — and the media route answers
 * without a session, so what an abusive client can pull is bounded only by a per-IP
 * request count (400/min). Redirecting moves those bytes to storage.googleapis.com: the
 * API still decides *whether* to hand out a URL, but it no longer carries the payload.
 *
 * Signing itself is gcs-sign.ts, which already does V4 through IAM signBlob for kit and
 * example downloads. This adds only the cache: media is requested far more often than a
 * kit tarball, and one signature per viewer would be a needless round trip.
 */
import { createGcsObjectStore, type GcsObjectStore } from './gcs-sign.js';

/** Long enough for a video to start and seek, short enough that a leaked link dies. */
export const MEDIA_URL_TTL_SECONDS = 15 * 60;

export interface MediaUrlSigner {
  /** A signed GET URL for `object`, reused while it still has comfortable life left. */
  urlFor(object: string): Promise<string>;
}

export function createMediaUrlSigner(options: {
  store: Pick<GcsObjectStore, 'signReadUrl'>;
  ttlSeconds?: number;
  now?: () => number;
  /** Cap on remembered URLs; media is a small, hot set. */
  maxCached?: number;
}): MediaUrlSigner {
  const ttlSeconds = options.ttlSeconds ?? MEDIA_URL_TTL_SECONDS;
  const now = options.now ?? Date.now;
  const maxCached = options.maxCached ?? 500;
  // Reused until half spent, so a client that follows the redirect late still has the
  // other half to finish the download — and a popular game costs one signature per
  // window rather than one per viewer.
  const reuseWindowMs = (ttlSeconds * 1000) / 2;
  const cache = new Map<string, { url: string; signedAt: number }>();

  return {
    async urlFor(object: string): Promise<string> {
      const cached = cache.get(object);
      const currentTime = now();
      if (cached && currentTime - cached.signedAt < reuseWindowMs) return cached.url;

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

/**
 * Off unless the snapshot bucket is configured and an explicit opt-in is set. The flag is
 * also the kill switch: a deploy without it serves media inline again, which is the
 * pre-2026-09 behaviour — always correct, only more expensive. It has to be threaded
 * through both deploy paths, or it evaporates on the next hand deploy.
 */
export function createMediaUrlSignerFromEnv(env: NodeJS.ProcessEnv = process.env): MediaUrlSigner | null {
  if (env.SERVE_MEDIA_FROM_GCS?.trim() !== 'true') return null;
  const bucket = env.GAMES_SNAPSHOT_BUCKET?.trim();
  if (!bucket) return null;
  // The signing identity is the runtime service account, resolved from ADC by
  // gcs-sign.ts — the same account and the same roles/iam.serviceAccountTokenCreator
  // grant that kit downloads already rely on.
  return createMediaUrlSigner({ store: createGcsObjectStore({ bucket }) });
}
