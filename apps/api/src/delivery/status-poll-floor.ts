// How soon a status poll could possibly see something new.

/**
 * This floor applies to every client, including a tab a creator is watching right now,
 * so it has to be sized by what can still happen — not by how long nothing has.
 *
 * The first version capped it at the 60s status-cache TTL, reasoning that a faster poll
 * could only re-read an identical cached body. That was the wrong constraint. A cache TTL
 * bounds how stale the server's own copy may be; it says nothing about the answer, and
 * `onEvent` busts the cache the moment an agent acts. A quiet self round is exactly the
 * one an agent rejoins: `start` pulses Studio so "agent stopped" cannot sit next to live
 * progress, and every stage refreshes the heartbeat. A minute-long floor would have put
 * that lingering state back, which is the failure `.claude/skills/byoca-mcp/SKILL.md`
 * records as already fixed.
 *
 * So the widening stops at ten seconds. Deeper savings belong on the client, where the
 * gate can be conditioned on nobody looking and snap back on the first keypress.
 */

// Nothing has moved recently, but an agent can rejoin at any moment.
const QUIET_MS = 10_000;
const MOVING_MS = 3_000;

// Session boot re-observes Agent Tasks on a 2s cache.
const DISPATCHED_MS = 2_000;

const QUIET_AFTER_MS = 2 * 60_000;

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
