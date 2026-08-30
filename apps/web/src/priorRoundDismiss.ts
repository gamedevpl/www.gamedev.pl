/**
 * Per-game preference: hide a superseded round's collapsed history block.
 * Dismiss is local only — the store still keeps the messages.
 */

import { readStorageItem, removeStorageItem, writeStorageItem } from './core/persistence.js';

const STORAGE_PREFIX = 'gamedev_prior_round_hide:';

function storageKey(slug: string, roundId: string): string {
  return `${STORAGE_PREFIX}${slug}:${roundId}`;
}

export function isPriorRoundDismissed(slug: string, roundId: string): boolean {
  return readStorageItem(storageKey(slug, roundId)) === '1';
}

export function setPriorRoundDismissed(slug: string, roundId: string, dismissed: boolean): void {
  const key = storageKey(slug, roundId);
  if (dismissed) writeStorageItem(key, '1');
  else removeStorageItem(key);
}
