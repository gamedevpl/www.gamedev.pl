/**
 * What the status poll is allowed to cost, independent of what it wants.
 *
 * `pollDelayMs` answers how fast this round would like to be watched. This answers how
 * fast anybody is actually watching, which is the question that decides the bill. See
 * `docs/firestore-read-cost.md` for the measurement behind it.
 *
 * Three gates, three different meanings of "nobody is watching":
 *
 * 1. Hidden — a background tab cannot be read, so it stops. Same rule as `activeBuilds.ts`.
 * 2. Idle — a visible but untouched tab. Somebody who walked away leaves a focused tab
 *    behind, so visibility alone misses them. Widens in steps; snaps back on a keypress.
 * 3. Server floor — `pollAfterMs`, the soonest the server's answer could differ. The
 *    policy lives there because a constant in a bundle only changes on a reload.
 *
 * The creator's own actions skip all three: they call `pokeStudioStatus`, which ticks now.
 */

// Untouched for this long and the tab is no longer being watched.
export const IDLE_AFTER_MS = 2 * 60_000;

const IDLE_STEPS: Array<{ afterMs: number; floorMs: number }> = [
  { afterMs: IDLE_AFTER_MS, floorMs: 10_000 },
  { afterMs: 10 * 60_000, floorMs: 30_000 },
  { afterMs: 30 * 60_000, floorMs: 60_000 },
];

// How slow an idle but visible tab may get.
export function idleFloorMs(msSinceInteraction: number): number {
  if (!Number.isFinite(msSinceInteraction) || msSinceInteraction < 0) return 0;
  let floor = 0;
  for (const step of IDLE_STEPS) {
    if (msSinceInteraction >= step.afterMs) floor = step.floorMs;
  }
  return floor;
}

export interface PollGateInput {
  // What the subscribers asked for; null means they opted out entirely.
  wantedMs: number | null;
  hidden: boolean;
  msSinceInteraction: number;
  // `pollAfterMs` from the newest status, when the server sent one.
  serverFloorMs?: number | undefined;
}

/**
 * The delay to actually use, or null to not schedule at all.
 *
 * A floor never overrides an opt-out: a round the page has stopped watching stays
 * stopped rather than being revived at the floor's cadence.
 */
export function gatedPollDelayMs(input: PollGateInput): number | null {
  if (input.wantedMs === null) return null;
  if (input.hidden) return null;
  const server = Number.isFinite(input.serverFloorMs ?? NaN) ? (input.serverFloorMs as number) : 0;
  return Math.max(input.wantedMs, idleFloorMs(input.msSinceInteraction), server);
}
