import type { ReviewSweepStatus } from '@gamedevpl/contract';
import type { ReviewSweep } from './store.js';

export const REVIEW_SWEEP_DAY_MS = 24 * 60 * 60 * 1000;

export const MAX_SWEEP_GAMES = 500;
export const MAX_RELEASE_PER_DAY = 200;

export function effectiveReleasedCount(sweep: ReviewSweep, nowMs: number): number {
  const total = sweep.slugs.length;
  if (total === 0) return 0;
  let n = sweep.releasedCount;
  if (sweep.status === 'active' && sweep.releasePerDay != null && sweep.releasePerDay > 0) {
    const started = Date.parse(sweep.startedAt);
    const elapsed = Number.isFinite(started) ? Math.max(0, nowMs - started) : 0;
    const days = Math.floor(elapsed / REVIEW_SWEEP_DAY_MS);
    n = Math.max(n, sweep.releasePerDay * (days + 1));
  }
  return Math.min(total, Math.max(0, n));
}

export function releasedSlugs(sweep: ReviewSweep, nowMs: number): string[] {
  const n = effectiveReleasedCount(sweep, nowMs);
  return sweep.slugs.slice(0, n);
}

export function isSweepOpen(status: ReviewSweepStatus): boolean {
  return status === 'active' || status === 'paused';
}

export interface ReviewSweepProgress {
  total: number;
  released: number;
  remainingInPool: number;
  assessedReleased: number;
  status: ReviewSweepStatus;
  releasePerDay: number | null;
}

export function summarizeSweepProgress(
  sweep: ReviewSweep,
  assessedSlugs: ReadonlySet<string>,
  nowMs: number,
): ReviewSweepProgress {
  const released = effectiveReleasedCount(sweep, nowMs);
  let assessedReleased = 0;
  for (const slug of sweep.slugs.slice(0, released)) {
    if (assessedSlugs.has(slug)) assessedReleased += 1;
  }
  return {
    total: sweep.slugs.length,
    released,
    remainingInPool: Math.max(0, sweep.slugs.length - released),
    assessedReleased,
    status: sweep.status,
    releasePerDay: sweep.releasePerDay,
  };
}

export function mintReviewSweepId(nowMs = Date.now()): string {
  return `swp-${nowMs.toString(36)}`;
}
