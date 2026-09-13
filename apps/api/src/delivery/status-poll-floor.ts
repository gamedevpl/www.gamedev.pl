// How soon a status poll could possibly see something new.

// The status response is cached for 60s and dropped by any write that changes the
// answer, so a poll faster than the floor below can only re-read an identical body.
// The creator's own actions do not wait on this: they invalidate the cache and the
// client pokes its poll immediately, which is why a coarse floor is safe here.

const MOVING_MS = 3_000;
const SETTLING_MS = 10_000;
const QUIET_MS = 30_000;
const DORMANT_MS = 60_000;

// Session boot re-observes Agent Tasks on a 2s cache.
const DISPATCHED_MS = 2_000;

const SETTLING_AFTER_MS = 2 * 60_000;
const QUIET_AFTER_MS = 10 * 60_000;
const DORMANT_AFTER_MS = 30 * 60_000;

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
  if (since < SETTLING_AFTER_MS) return MOVING_MS;
  if (since < QUIET_AFTER_MS) return SETTLING_MS;
  if (since < DORMANT_AFTER_MS) return QUIET_MS;
  return DORMANT_MS;
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
