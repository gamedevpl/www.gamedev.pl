import type { JobState, SubmissionState } from '@gamedevpl/contract';

export interface SweepScopeRecord {
  abandonedAt?: string;
  lastNotifiedStatus?: SubmissionState;
  lastStatus?: SubmissionState;
  state?: JobState;
  builder?: 'platform' | 'self';
  builderHandoff?: unknown;
  dispatch?: { refs: string[] };
  roundGeneration?: number;
  gateRepair?: { roundGeneration: number };
  transitions?: { reason?: string }[];
}

export function hasPendingGateRepair(record: SweepScopeRecord): boolean {
  return Boolean(
    record.state === 'needs_changes' &&
    record.builder !== 'self' &&
    !record.builderHandoff &&
    record.dispatch?.refs.length &&
    record.gateRepair?.roundGeneration !== (record.roundGeneration ?? 1) &&
    ['gate_red', 'kit_outdated'].includes(record.transitions?.at(-1)?.reason ?? ''),
  );
}
