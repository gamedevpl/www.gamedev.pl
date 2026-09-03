import { rememberBounded } from '../platform/bounded-map.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;
const MAX_TRACKED_IPS = 20_000;

export function isVisitTelemetryRateLimited(buckets: Map<string, number[]>, key: string, currentTime: number): boolean {
  const hits = (buckets.get(key) ?? []).filter((timestamp) => currentTime - timestamp < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= MAX_REQUESTS_PER_WINDOW) {
    rememberBounded(buckets, key, hits, MAX_TRACKED_IPS);
    return true;
  }
  hits.push(currentTime);
  rememberBounded(buckets, key, hits, MAX_TRACKED_IPS);
  return false;
}
