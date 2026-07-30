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
  | 'build_stalled';

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

/** Oldest first within a kind: the thing that has been waiting longest is the thing to do. */
const KIND_ORDER: Record<OperatorAlertKind, number> = {
  review_ready: 0,
  build_stalled: 1,
  build_failed: 2,
};

function alertFor(record: SubmissionRecord, now: number): OperatorAlert | null {
  if (record.abandonedAt) return null;

  const state = resolveJobState(record);
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
export function detectOperatorAlerts(records: SubmissionRecord[], now: number): OperatorAlert[] {
  return records
    .map((record) => alertFor(record, now))
    .filter((alert): alert is OperatorAlert => alert !== null)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Date.parse(a.since) - Date.parse(b.since));
}
