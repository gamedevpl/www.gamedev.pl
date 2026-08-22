// The game's last builder choice is remembered so the next round can default to it
// without waiting on a status field the API may not yet echo.

import { BUILDERS, isBuilderKind, type BuilderKind } from '@gamedevpl/contract';

export { BUILDERS, isBuilderKind, type BuilderKind };

const STORAGE_PREFIX = 'gamedev_last_builder:';

/** Last builder the creator picked for this game (status token), if any. */
export function loadLastBuilder(token: string): BuilderKind | null {
  if (!token) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${token}`);
    return isBuilderKind(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastBuilder(token: string, builder: BuilderKind): void {
  if (!token) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${token}`, builder);
  } catch {
    // Persistence is a convenience — never a precondition.
  }
}

/** Default for a new round: remembered choice, else platform. */
export function defaultBuilderFor(token: string | undefined): BuilderKind {
  if (!token) return 'platform';
  return loadLastBuilder(token) ?? 'platform';
}
