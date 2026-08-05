/**
 * Per-game preference: hide a superseded round's collapsed history block.
 * Dismiss is local only — the store still keeps the messages.
 */

const STORAGE_PREFIX = 'gamedev_prior_round_hide:';

function storageKey(slug: string, roundId: string): string {
  return `${STORAGE_PREFIX}${slug}:${roundId}`;
}

export function isPriorRoundDismissed(slug: string, roundId: string): boolean {
  try {
    return localStorage.getItem(storageKey(slug, roundId)) === '1';
  } catch {
    return false;
  }
}

export function setPriorRoundDismissed(slug: string, roundId: string, dismissed: boolean): void {
  try {
    const key = storageKey(slug, roundId);
    if (dismissed) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Preference only — private mode must not break the thread.
  }
}
