import { isActiveBuildRound, nextRoundGeneration, resolveJobState } from '../../creation/job-state.js';
import type { SubmissionRecord } from '../records/submission.js';

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
    agentEndedBy: 'end',
  };
  // A takeover revokes the agent; its old key must not keep reading.
  delete next.receiptRound;
  return next;
}
