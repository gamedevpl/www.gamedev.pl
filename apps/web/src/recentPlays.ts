/**
 * Ephemeral, device-local recent plays for anonymous cold-start recommendations.
 *
 * Kept in localStorage (not a cookie, not sent as identity). The home page may
 * forward the slugs as `?recent=` hints; the server validates them against the
 * published catalog and never stores them on an account from this path.
 */

const STORAGE_KEY = 'gdpl.recentPlays';
const MAX_RECENT = 8;

function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(entry));
  } catch {
    return [];
  }
}

export function getRecentPlays(): string[] {
  return readRaw().slice(0, MAX_RECENT);
}

export function rememberRecentPlay(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return;
  const next = [slug, ...readRaw().filter((entry) => entry !== slug)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — recommendations simply stay cold-start.
  }
}
