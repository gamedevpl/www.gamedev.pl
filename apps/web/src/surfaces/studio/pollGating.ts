// How fast anybody is actually watching, not how fast wanted.

// Hidden stops, idle widens, the server floor caps both.

// Rationale and measurements: docs/firestore-read-cost.md.


// Untouched this long and nobody is watching.
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

export function gatedPollDelayMs(input: PollGateInput): number | null {
  if (input.wantedMs === null) return null;
  if (input.hidden) return null;
  const server = Number.isFinite(input.serverFloorMs ?? NaN) ? (input.serverFloorMs as number) : 0;
  return Math.max(input.wantedMs, idleFloorMs(input.msSinceInteraction), server);
}
