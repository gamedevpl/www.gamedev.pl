// Which submissions the notify sweep still has business looking at.

import type { JobState, SubmissionState } from '@gamedevpl/contract';

export interface SweepScopeRecord {
  abandonedAt?: string;
  lastNotifiedStatus?: SubmissionState;
  state?: JobState;
}

// `needs_changes` is what was last told, not what the job does.
export function isSweepActive(record: SweepScopeRecord): boolean {
  if (record.abandonedAt) return false;
  if (record.lastNotifiedStatus === 'published') return false;
  // The gate owes a verdict, so the sweep must reach it.
  if (record.state === 'submitted' || record.state === 'gating') return true;
  return record.lastNotifiedStatus !== 'needs_changes';
}
