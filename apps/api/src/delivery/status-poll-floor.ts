// How soon a status poll could possibly see something new.

// Sized by what can still happen, never by the cache TTL.

// Why the TTL is the wrong ceiling: ops repo read-cost doc.


// Nothing has moved recently, but an agent can rejoin at any moment.
const QUIET_MS = 10_000;
const MOVING_MS = 3_000;

// Session boot re-observes Agent Tasks on a 2s cache.
const DISPATCHED_MS = 2_000;

const QUIET_AFTER_MS = 2 * 60_000;

// Session boot takes seconds; a dispatch older than this is stuck.
export const BOOT_WINDOW_MS = 10 * 60_000;

// Only a fresh dispatch earns the 2s cache and floor.
export function stillBooting(stateSince: string | undefined, at: number): boolean {
  const since = stateSince ? Date.parse(stateSince) : Number.NaN;
  return Number.isFinite(since) && at - since < BOOT_WINDOW_MS;
}

export interface StatusPollFloorInput {
  // Published or abandoned: the client stops polling on its own.
  terminal: boolean;
  // Session boot, where the underlying cache is 2s rather than 60s.
  dispatched: boolean;
  // Since anything about this round last changed.
  msSinceMovement: number;
}

export function statusPollFloorMs(input: StatusPollFloorInput): number | undefined {
  if (input.terminal) return undefined;
  if (input.dispatched) return DISPATCHED_MS;
  const since = input.msSinceMovement;
  // An unknown or nonsensical age must never slow the live feed down.
  if (!Number.isFinite(since) || since < 0) return MOVING_MS;
  return since < QUIET_AFTER_MS ? MOVING_MS : QUIET_MS;
}

// The newest timestamp that counts as this round moving.
export function lastMovementAt(stamps: Array<string | undefined>): number | undefined {
  let newest: number | undefined;
  for (const stamp of stamps) {
    if (!stamp) continue;
    const at = Date.parse(stamp);
    if (!Number.isFinite(at)) continue;
    if (newest === undefined || at > newest) newest = at;
  }
  return newest;
}
