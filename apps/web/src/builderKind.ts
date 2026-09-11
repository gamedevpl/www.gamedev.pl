// The game's last builder choice is remembered so the next round can default to it
// without waiting on a status field the API may not yet echo.

import { BUILDERS, isBuilderKind, type BuilderKind } from '@gamedevpl/contract';
import { readStorageItem, writeStorageItem } from './core/persistence.js';

export { BUILDERS, isBuilderKind, type BuilderKind };

const STORAGE_PREFIX = 'gamedev_last_builder:';

/** Last builder the creator picked for this game (status token), if any. */
export function loadLastBuilder(token: string): BuilderKind | null {
  if (!token) return null;
  const raw = readStorageItem(`${STORAGE_PREFIX}${token}`);
  return isBuilderKind(raw) ? raw : null;
}

export function saveLastBuilder(token: string, builder: BuilderKind): void {
  if (!token) return;
  writeStorageItem(`${STORAGE_PREFIX}${token}`, builder);
}

/** Default for a new round: remembered choice, else platform. */
export function defaultBuilderFor(token: string | undefined): BuilderKind {
  if (!token) return 'platform';
  return loadLastBuilder(token) ?? 'platform';
}
