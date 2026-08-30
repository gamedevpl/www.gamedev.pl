/**
 * Ephemeral, device-local recent plays for anonymous cold-start recommendations.
 *
 * Kept in localStorage (not a cookie, not sent as identity). The home page may
 * forward the slugs as `?recent=` hints; the server validates them against the
 * published catalog and never stores them on an account from this path.
 */

import { readStorageJSON, writeStorageJSON } from './core/persistence.js';

const STORAGE_KEY = 'gdpl.recentPlays';
const MAX_RECENT = 8;

function readRaw(): string[] {
  const parsed = readStorageJSON<unknown>(STORAGE_KEY);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(entry));
}

export function getRecentPlays(): string[] {
  return readRaw().slice(0, MAX_RECENT);
}

export function rememberRecentPlay(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return;
  const next = [slug, ...readRaw().filter((entry) => entry !== slug)].slice(0, MAX_RECENT);
  writeStorageJSON(STORAGE_KEY, next);
}
