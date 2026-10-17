// Gate for managed-only tools: the opener must speak for this round.

import type { SubmissionRecord } from '../platform/store.js';

export interface ManagedOpener {
  jobId: number;
  roundGeneration?: number;
  exp?: number;
  shell?: boolean;
}

export function opensManagedRound(
  opener: ManagedOpener | null,
  auth: { jobId: number; record: SubmissionRecord; claims: { roundGeneration?: number } },
  nowMs: number,
): opener is ManagedOpener {
  const current = auth.record.roundGeneration ?? 1;
  return (
    opener !== null &&
    opener.jobId === auth.jobId &&
    opener.roundGeneration === current &&
    (auth.claims.roundGeneration ?? current) === current &&
    (opener.exp ?? 0) * 1000 > nowMs &&
    (auth.record.builder ?? 'platform') === 'platform'
  );
}
