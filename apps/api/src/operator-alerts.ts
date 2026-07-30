// What actually wants a person, out of everything the queue can show.
//
// The queue (job-admin-routes.ts) answers "what is in flight". This answers the narrower
// question a notification may be sent about: which jobs are waiting on somebody rather
// than on time passing. The two are deliberately different — a build that has been
// running for forty minutes and reporting progress belongs in the queue and nowhere near
// an inbox.
//
// One pure function because two callers need the same answer: the console badge and the
// sweep that emails. An alert that shows up in one and not the other is worse than no
// alert, because the number stops meaning anything.

import { detectStall, isTerminal, resolveJobState, type JobStall } from './job-state.js';
import type { SubmissionRecord } from './store.js';

export type OperatorAlertKind =
  /** Gate green, waiting for the publish decision — the one thing only a human does. */
  | 'review_ready'
  /** The round ended with nothing delivered, or the agent gave up. */
  | 'build_failed'
  /** Still open, but nothing has moved for longer than the job's state tolerates. */
  | 'build_stalled'
  /**
   * A creator's change request that no agent has collected.
   *
   * Its own kind rather than a flavour of stall, because it is a failure of a
   * different thing: the request reached us, and the relay that turns it into
   * something an agent wakes for did not fire. Nothing errors when that breaks — the
   * comment lands, no session starts, and the creator waits on an answer that is not
   * coming. This is the only symptom.
   */
  | 'feedback_undelivered';

export interface OperatorAlert {
  /**
   * Stable per job and kind, so re-running the sweep does not re-notify. The cost is
   * that a job which stalls, recovers and stalls again only alerts once — the right
   * trade for a channel whose failure mode is being ignored.
   */
  id: string;
  kind: OperatorAlertKind;
  issueNumber: number;
  title: string;
  ownerUid: string;
  slug?: string;
  /** When the job entered the situation being alerted about. */
  since: string;
  /** Only on `build_stalled`: which flavour of stuck, so the fix is legible. */
  stall?: JobStall;
}

/**
 * How long a failure stays news.
 *
 * A failed job is terminal, so it sits in the active set until the creator retries or
 * walks away — without a window the console would accumulate every failure since launch
 * and the count would be furniture rather than a signal.
 */
export const FAILED_ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long a creator's change request may sit uncollected before it is a stall.
 *
 * Generous on purpose: the relay fires in seconds, but the agent it wakes only acks its
 * inbox once it has a session running, and a queue behind a busy repo can legitimately
 * take a while. An hour is far past that and far short of the creator giving up.
 */
export const FEEDBACK_STALL_MS = 60 * 60 * 1000;

/** Oldest first within a kind: the thing that has been waiting longest is the thing to do. */
const KIND_ORDER: Record<OperatorAlertKind, number> = {
  review_ready: 0,
  feedback_undelivered: 1,
  build_stalled: 2,
  build_failed: 3,
};

/**
 * When the oldest uncollected change request for a job arrived, per job.
 *
 * Passed in rather than read here because it is a separate query per job and this module
 * does no I/O. A caller that cannot afford the reads passes nothing and gets the other
 * three kinds, which is a smaller answer but never a wrong one.
 */
export type PendingFeedbackAges = ReadonlyMap<number, string>;

function alertFor(record: SubmissionRecord, now: number, pendingFeedback?: PendingFeedbackAges): OperatorAlert | null {
  if (record.abandonedAt) return null;

  const state = resolveJobState(record);

  // Checked before the job's own state, and deliberately — twice over. A job can look
  // perfectly healthy, building and reporting progress, while the request the creator is
  // waiting on never reached it; that is the case this kind exists for. And it is the one
  // alert that needs no state at all, so a record whose state cannot be resolved — a
  // legacy one, or one whose first derivation has not been written back yet — still
  // reports it rather than being skipped as unreadable.
  const pendingSince = pendingFeedback?.get(record.issueNumber);
  if (pendingSince && (!state || !isTerminal(state)) && now - Date.parse(pendingSince) > FEEDBACK_STALL_MS) {
    return {
      id: `op-${record.issueNumber}-feedback_undelivered`,
      kind: 'feedback_undelivered',
      issueNumber: record.issueNumber,
      title: record.title,
      ownerUid: record.ownerUid,
      ...(record.slug ? { slug: record.slug } : {}),
      since: pendingSince,
    };
  }

  if (!state) return null;

  const since = record.stateSince ?? record.createdAt;
  const base = {
    issueNumber: record.issueNumber,
    title: record.title,
    ownerUid: record.ownerUid,
    ...(record.slug ? { slug: record.slug } : {}),
    since,
  };

  if (state === 'ready_for_review') {
    return { id: `op-${record.issueNumber}-review_ready`, kind: 'review_ready', ...base };
  }

  if (state === 'failed') {
    const at = Date.parse(since);
    if (!Number.isFinite(at) || now - at > FAILED_ALERT_WINDOW_MS) return null;
    return { id: `op-${record.issueNumber}-build_failed`, kind: 'build_failed', ...base };
  }

  // Everything else terminal — published, canceled — is somebody's finished business.
  if (isTerminal(state)) return null;

  const stall = detectStall({
    state,
    stateSince: since,
    lastAgentSignalAt: record.lastAgentSignalAt,
    agentState: record.agentState,
    now,
  });
  if (!stall) return null;
  return { id: `op-${record.issueNumber}-build_stalled`, kind: 'build_stalled', ...base, stall };
}

/**
 * Every job that wants attention, worst first.
 *
 * Pure and clock-injected like the rest of job-state, so the console and the sweep can
 * be tested against the same fixtures and the same instant.
 */
export function detectOperatorAlerts(
  records: SubmissionRecord[],
  now: number,
  pendingFeedback?: PendingFeedbackAges,
): OperatorAlert[] {
  return records
    .map((record) => alertFor(record, now, pendingFeedback))
    .filter((alert): alert is OperatorAlert => alert !== null)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Date.parse(a.since) - Date.parse(b.since));
}
