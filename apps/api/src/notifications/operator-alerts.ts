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

import { detectStall, isTerminal, resolveJobState, type JobStall } from '../creation/job-state.js';
import type { JobSeedOutcome, SubmissionRecord } from '../platform/store.js';

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
  | 'feedback_undelivered'
  /**
   * A *published* game's health re-gate came back red: it no longer passes the check on
   * the current engine. Not produced by `detectOperatorAlerts` — that walks active
   * jobs, and this is about a finished one — the sweep raises it directly when it reads
   * the verdict off the manifest. The game keeps serving either way; the creator has
   * been nudged, and this is the operator's copy of that fact.
   */
  | 'game_unhealthy'
  /**
   * Round 0 is failing: no draft generated, or no draft placed.
   *
   * The odd one out here in two ways, both deliberate. It is not about a job — every
   * affected build ran fine, unseeded, and no creator is waiting on anything — and it is
   * not produced by walking one record, because "this keeps happening" is the whole
   * claim. It exists because the failure it names has no other symptom: seeding fails
   * open, so a broken write credential shows up as builds that are quietly a bit slower
   * and a Vertex bill that is quietly larger. The first time it happened, it was found
   * by a person noticing a slow button.
   */
  | 'seeding_degraded';

/**
 * The kinds that are about one job — everything `detectOperatorAlerts` can produce, and
 * exactly what may be emailed to an operator.
 *
 * `seeding_degraded` is deliberately outside this set. It is about the platform's own
 * plumbing and is watched by Cloud Monitoring (alert A23) rather than by the sweep, so a
 * failure in the app cannot silence the alert about the app. Expressing that as a type
 * rather than as a convention means `emitOperatorAlert` cannot be handed one by accident,
 * and the compiler — not a reviewer — is what notices if the two channels ever converge.
 */
export type JobAlertKind = Exclude<OperatorAlertKind, 'seeding_degraded'>;

/** An alert with a job behind it. What the notification path accepts. */
export interface JobAlert extends OperatorAlert {
  kind: JobAlertKind;
  jobId: number;
  ownerUid: string;
}

export interface OperatorAlert {
  /**
   * Stable per job and kind, so re-running the sweep does not re-notify. The cost is
   * that a job which stalls, recovers and stalls again only alerts once — the right
   * trade for a channel whose failure mode is being ignored.
   */
  id: string;
  kind: OperatorAlertKind;
  /**
   * The job this is about. Absent on the kinds that are about the platform rather than
   * about one job (`seeding_degraded`) — rendering `#0` for those would send an operator
   * looking for a job that does not exist.
   */
  jobId?: number;
  title: string;
  ownerUid?: string;
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
  // Last because it is the least urgent thing here: the game still serves, and the
  // creator — not the operator — holds the fix.
  game_unhealthy: 4,
  // Last: nothing is broken for any creator, and it is the operator's own plumbing.
  seeding_degraded: 5,
};

/** How far back a staging failure still counts toward "this is still happening". */
export const SEEDING_DEGRADED_WINDOW_MS = 24 * 60 * 60_000;

/**
 * At least this many seeded attempts in the window, all of them unplaced, before saying
 * so. One failure is a bad minute — GitHub has those — and paging on it would teach the
 * operator to ignore this channel. Two in a day is a configuration fact, and because a
 * broken write scope fails every attempt, the second one arrives with the next build.
 */
export const SEEDING_DEGRADED_MIN_FAILURES = 2;

/**
 * When the oldest uncollected change request for a job arrived, per job.
 *
 * Passed in rather than read here because it is a separate query per job and this module
 * does no I/O. A caller that cannot afford the reads passes nothing and gets the other
 * three kinds, which is a smaller answer but never a wrong one.
 */
export type PendingFeedbackAges = ReadonlyMap<number, string>;

function alertFor(record: SubmissionRecord, now: number, pendingFeedback?: PendingFeedbackAges): JobAlert | null {
  if (record.abandonedAt) return null;

  const state = resolveJobState(record);

  // Checked before the job's own state, and deliberately — twice over. A job can look
  // perfectly healthy, building and reporting progress, while the request the creator is
  // waiting on never reached it; that is the case this kind exists for. And it is the one
  // alert that needs no state at all, so a record whose state cannot be resolved — a
  // legacy one, or one whose first derivation has not been written back yet — still
  // reports it rather than being skipped as unreadable.
  const pendingSince = pendingFeedback?.get(record.jobId);
  if (pendingSince && (!state || !isTerminal(state)) && now - Date.parse(pendingSince) > FEEDBACK_STALL_MS) {
    return {
      id: `op-${record.jobId}-feedback_undelivered`,
      kind: 'feedback_undelivered',
      jobId: record.jobId,
      title: record.title,
      ownerUid: record.ownerUid,
      ...(record.slug ? { slug: record.slug } : {}),
      since: pendingSince,
    };
  }

  if (!state) return null;

  const since = record.stateSince ?? record.createdAt;
  const base = {
    jobId: record.jobId,
    title: record.title,
    ownerUid: record.ownerUid,
    ...(record.slug ? { slug: record.slug } : {}),
    since,
  };

  if (state === 'ready_for_review') {
    return { id: `op-${record.jobId}-review_ready`, kind: 'review_ready', ...base };
  }

  if (state === 'failed') {
    const at = Date.parse(since);
    if (!Number.isFinite(at) || now - at > FAILED_ALERT_WINDOW_MS) return null;
    return { id: `op-${record.jobId}-build_failed`, kind: 'build_failed', ...base };
  }

  // Everything else terminal — published, canceled — is somebody's finished business.
  if (isTerminal(state)) return null;

  const stall = detectStall({
    state,
    stateSince: since,
    lastAgentSignalAt: record.lastAgentSignalAt,
    agentState: record.agentState,
    agentEndedAt: record.agentEndedAt,
    now,
  });
  if (!stall) return null;
  return { id: `op-${record.jobId}-build_stalled`, kind: 'build_stalled', ...base, stall };
}

/**
 * Whether round 0 is failing — generating nothing, or drafts nobody can place.
 *
 * Separate from `detectOperatorAlerts` because it is a judgement about a *set* of jobs
 * rather than about each one, and because its alert has no job to point at. Returns null
 * when seeding is healthy or simply has not run: a platform with no new games in a day
 * must not page anyone.
 */
export function detectSeedingDegraded(outcomes: JobSeedOutcome[], at: number): OperatorAlert | null {
  const since = at - SEEDING_DEGRADED_WINDOW_MS;
  // Re-filtered here even though the caller queries by the same window: the window is
  // this module's decision, and a caller that reads a little wide must not widen it.
  const recent = outcomes.filter((outcome) => {
    const stamped = Date.parse(outcome.at);
    return Number.isFinite(stamped) && stamped >= since;
  });

  // Never generated is as failed as never placed: both scaffold from nothing.
  const failed = recent.filter((outcome) => outcome.generated === false || !outcome.staged);
  // Every recent attempt has to have failed. A mix means round 0 works and something
  // about one draft did not, which is a different problem and not this alert's.
  if (failed.length < SEEDING_DEGRADED_MIN_FAILURES || failed.length !== recent.length) return null;

  const oldest = failed.reduce((earliest, outcome) => (outcome.at < earliest.at ? outcome : earliest));
  // Named only when every failure shares a provider; absent means vertex.
  const providers = [...new Set(failed.map((outcome) => outcome.provider ?? 'vertex'))];
  const namedProvider = providers.length === 1 ? providers[0] : undefined;
  return {
    // Per day, not per occurrence: this nags once a day while it is broken rather than
    // once ever (which a job-scoped id would give) or once per build (which is a pager).
    id: `op-seeding-degraded-${new Date(at).toISOString().slice(0, 10)}`,
    kind: 'seeding_degraded',
    // Phrased as a noun the copy can predicate on: every surface renders an alert as
    // “{title}” followed by what happened to it.
    title: namedProvider
      ? `The last ${failed.length} new games (${namedProvider})`
      : `The last ${failed.length} new games`,
    since: oldest.at,
  };
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
): JobAlert[] {
  return records
    .map((record) => alertFor(record, now, pendingFeedback))
    .filter((alert): alert is JobAlert => alert !== null)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Date.parse(a.since) - Date.parse(b.since));
}
