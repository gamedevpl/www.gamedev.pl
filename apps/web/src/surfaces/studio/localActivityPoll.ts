import type { LocalActivity } from '@gamedevpl/contract';

// Fast enough to catch a start, slow enough to idle cheaply.
export const LOCAL_ACTIVITY_FAST_MS = 10_000;
export const LOCAL_ACTIVITY_IDLE_MS = 60_000;

// Widen only after a run of empty polls, never immediately.
export const LOCAL_ACTIVITY_IDLE_AFTER = 6;

export const LOCAL_ACTIVITY_TERMINAL = ['ready', 'failed', 'stopped'];

// A finished task still polls slowly; the next one appears here.
export function nextLocalActivityDelay(activity: LocalActivity | null, emptyPolls: number): number {
  if (activity) {
    return LOCAL_ACTIVITY_TERMINAL.includes(activity.phase) ? LOCAL_ACTIVITY_IDLE_MS : LOCAL_ACTIVITY_FAST_MS;
  }
  return emptyPolls >= LOCAL_ACTIVITY_IDLE_AFTER ? LOCAL_ACTIVITY_IDLE_MS : LOCAL_ACTIVITY_FAST_MS;
}
