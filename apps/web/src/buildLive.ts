import type { SubmissionStatus } from './submissionApi.js';

const CURRENTLY_MOVING_STATUSES = new Set<SubmissionStatus['status']>(['building', 'publishing']);

// The gate owning a delivery outranks an agent stall.
export function isBuildLive(status: SubmissionStatus): boolean {
  if (status.gateProgress) return true;
  if (status.phase === 'submitted' || status.phase === 'gating') return true;
  if (status.stall) return false;
  return CURRENTLY_MOVING_STATUSES.has(status.status);
}
