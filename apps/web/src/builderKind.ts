/**
 * Who builds a round: the platform's AI dev team, or the creator's own coding agent.
 *
 * Mirrors the API's `platform` | `self`. The game's last choice is remembered so the
 * next round can default to it without waiting on a status field the API may not
 * yet echo.
 */

export const BUILDERS = ['platform', 'self'] as const;
export type BuilderKind = (typeof BUILDERS)[number];

export function isBuilderKind(value: unknown): value is BuilderKind {
  return value === 'platform' || value === 'self';
}

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
