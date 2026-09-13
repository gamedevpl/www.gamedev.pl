import { rememberBounded } from './bounded-map.js';

export const SWEEP_FRESH_MS = 60 * 60_000;
export const SWEEP_RECENT_MS = 24 * SWEEP_FRESH_MS;

export const RECHECK_NOW_MS = 0;
export const RECHECK_TEN_MINUTES_MS = 10 * 60_000;
export const RECHECK_HOURLY_MS = 60 * 60_000;

const MAX_TRACKED_JOBS = 2_000;

// A record still for a day cannot change in two minutes.
export function sweepRecheckDelayMs(stillnessMs: number): number {
  if (!Number.isFinite(stillnessMs) || stillnessMs < SWEEP_FRESH_MS) return RECHECK_NOW_MS;
  if (stillnessMs < SWEEP_RECENT_MS) return RECHECK_TEN_MINUTES_MS;
  return RECHECK_HOURLY_MS;
}

export interface SweepCadence {
  isDue(input: { jobId: number; now: number; lastActivityAt: number }): boolean;
  reschedule(input: { jobId: number; now: number; lastActivityAt: number; hot?: boolean }): void;
  forget(jobId: number): void;
  tracked(): number;
}

interface Scheduled {
  dueAt: number;
  activityAt: number;
}

// A job this process has never derived is always due.
export function createSweepCadence(): SweepCadence {
  const schedule = new Map<number, Scheduled>();

  return {
    isDue({ jobId, now, lastActivityAt }) {
      const entry = schedule.get(jobId);
      if (entry === undefined) return true;
      if (entry.dueAt <= now) return true;
      // The record moved while deferred, so the deferral is void.
      return Number.isFinite(lastActivityAt) && lastActivityAt > entry.activityAt;
    },
    reschedule({ jobId, now, lastActivityAt, hot }) {
      const delay = hot ? RECHECK_NOW_MS : sweepRecheckDelayMs(now - lastActivityAt);
      const activityAt = Number.isFinite(lastActivityAt) ? lastActivityAt : now;
      rememberBounded(schedule, jobId, { dueAt: now + delay, activityAt }, MAX_TRACKED_JOBS);
    },
    forget(jobId) {
      schedule.delete(jobId);
    },
    tracked() {
      return schedule.size;
    },
  };
}
