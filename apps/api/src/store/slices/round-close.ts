import { isActiveBuildRound, nextRoundGeneration, resolveJobState, type JobState } from '../../creation/job-state.js';
import type { SubmissionRecord } from '../records/submission.js';
import { lastRoundActivityAt } from '../../platform/quiet-round.js';

// A transition is refused unless every field given still matches the record.
export interface TransitionGuard {
  // The round's newest activity stamp.
  state?: JobState;
  activityAt?: number;
  roundGeneration?: number;
  // The latest dispatch ref, so a replacement round is never closed.
  dispatchRef?: string;
}

export function guardHolds(sub: SubmissionRecord, guard: TransitionGuard): boolean {
  if (guard.state !== undefined && (sub.state ?? 'queued') !== guard.state) return false;
  if (guard.activityAt !== undefined && lastRoundActivityAt(sub) !== guard.activityAt) return false;
  if (guard.roundGeneration !== undefined && (sub.roundGeneration ?? 1) !== guard.roundGeneration) return false;
  return guard.dispatchRef === undefined || sub.dispatch?.refs.at(-1) === guard.dispatchRef;
}

// Fields a closed round clears -- signals belong to the round that ended.
export function clearRoundSignals(next: SubmissionRecord): void {
  delete next.seed;
  delete next.seedStatus;
  delete next.lastAgentSignalAt;
  delete next.lastAgentPresence;
  delete next.agentEndedAt;
  delete next.agentEndedBy;
  delete next.roundKitEngineRef;
  delete next.roundTypecheckPreflightBypassErrors;
  delete next.roundLastGateMetricKey;
  delete next.receiptRound;
}

// Remembers which round a state transition closed, and its delivery.
export function stampReceiptRound(next: SubmissionRecord, closed: SubmissionRecord): void {
  if (closed.roundGeneration === undefined) return;
  // A round that delivered owns its newest candidate, preview or publish.
  const delivered = (closed.roundDeliveryCount ?? 0) > 0;
  const version = (delivered ? closed.previewVersion : undefined) ?? closed.deliveredVersion;
  next.receiptRound = { generation: closed.roundGeneration, ...(version ? { version } : {}) };
}

export function takeoverRecord(
  sub: SubmissionRecord,
  authorized: boolean,
  generation: number,
  at: string,
): SubmissionRecord | null {
  const state = resolveJobState(sub) ?? 'queued';
  if (
    !authorized ||
    (sub.roundGeneration ?? 1) !== generation ||
    sub.abandonedAt ||
    (sub.builder ?? sub.defaultBuilder ?? 'platform') !== 'self' ||
    !isActiveBuildRound({ state, transitions: sub.transitions }) ||
    state === 'submitted' ||
    state === 'publishing' ||
    sub.builderHandoff ||
    sub.agentEndedAt ||
    !sub.dispatch?.refs?.length
  )
    return null;
  const next: SubmissionRecord = {
    ...sub,
    roundGeneration: nextRoundGeneration(sub.roundGeneration ?? 1),
    agentEndedAt: at,
    agentEndedBy: 'takeover',
  };
  // A takeover revokes the agent; its old key must not keep reading.
  delete next.receiptRound;
  return next;
}
