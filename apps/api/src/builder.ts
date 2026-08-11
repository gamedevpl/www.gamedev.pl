// Which coding agent builds a round: the platform's (Copilot) or the creator's own.
//
// A round may switch builders only through an explicit handoff.

import type { JobState, JobStall, JobTransition } from './job-state.js';

export const BUILDERS = ['platform', 'self'] as const;
export type BuilderKind = (typeof BUILDERS)[number];

export function isBuilderKind(value: unknown): value is BuilderKind {
  return value === 'platform' || value === 'self';
}

/** Default lifetime before a self round with no agent signal is auto-abandoned. */
export const DEFAULT_SELF_BUILD_CONNECT_DAYS = 14;

/** Default per-round sources-delivery ceiling for self builds (bounds gate spend). */
export const DEFAULT_SELF_BUILD_DELIVERY_CAP = 20;

export function selfBuildConnectDays(): number {
  const parsed = Number(process.env.SELF_BUILD_CONNECT_DAYS ?? DEFAULT_SELF_BUILD_CONNECT_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SELF_BUILD_CONNECT_DAYS;
}

export function selfBuildDeliveryCap(): number {
  const parsed = Number(process.env.SELF_BUILD_DELIVERY_CAP ?? DEFAULT_SELF_BUILD_DELIVERY_CAP);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SELF_BUILD_DELIVERY_CAP;
}

/** Whether the current round is still live. */
export function isActiveBuildRound(record: { state?: JobState; transitions?: JobTransition[] }): boolean {
  const state = record.state;
  switch (state) {
    case 'queued':
    case 'dispatched':
    case 'building':
    case 'submitted':
    case 'gating':
    case 'publishing':
      return true;
    case 'needs_changes': {
      const last = [...(record.transitions ?? [])].reverse().find((transition) => transition.to === 'needs_changes');
      return last?.reason === 'gate_red' || last?.reason === 'kit_outdated';
    }
    default:
      return false;
  }
}

/** Stalls that unlock self→platform handoff. */
const SELF_TO_PLATFORM_HANDOFF_STALLS: ReadonlySet<JobStall> = new Set(['ended', 'quiet', 'no_agent_yet']);

/** Allows self→platform handoff after signal loss or creator confirmation. */
export function allowsSelfToPlatformHandoff(input: {
  currentBuilder: BuilderKind;
  requestedBuilder: BuilderKind;
  stall?: string | null;
  /** When set, unlocks even if stall was overwritten by `gate_not_started`. */
  agentEndedAt?: string | null;
  creatorRequested?: boolean;
}): boolean {
  if (input.requestedBuilder !== 'platform' || input.currentBuilder !== 'self') return false;
  if (input.creatorRequested) return true;
  if (input.agentEndedAt) return true;
  return typeof input.stall === 'string' && SELF_TO_PLATFORM_HANDOFF_STALLS.has(input.stall as JobStall);
}

/** Whether the creator may replace the active builder for this round. */
export function allowsCreatorBuilderHandoff(input: {
  currentBuilder: BuilderKind;
  requestedBuilder: BuilderKind;
  stall?: string | null;
  agentEndedAt?: string | null;
  creatorRequested?: boolean;
}): boolean {
  if (input.currentBuilder === 'self' && input.requestedBuilder === 'platform') {
    return allowsSelfToPlatformHandoff(input);
  }
  return input.currentBuilder === 'platform' && input.requestedBuilder === 'self' && input.creatorRequested === true;
}

/**
 * Whether creator feedback should only go to the build-channel inbox (no new dispatch).
 *
 * An in-flight round that already has a dispatch ref has an agent that will poll the
 * inbox — including after delivery while the gate runs, and on gate-red / kit_outdated
 * repair, where the same session is often still alive. Starting another Copilot task on
 * top of that is what produced concurrent builds of one game.
 *
 * Ended or stalled platform rounds restart instead.
 *
 * Excludes `publishing`: reaching it already closed the round (token generation bumped),
 * so no session can collect inbox mail — the feedback route rejects that state instead.
 *
 * A `queued` job with **no** refs is different: dispatch never landed, so nobody will
 * read the inbox. Feedback must retry `resumeBuild` in that case.
 *
 * A quiet self→platform handoff must not take this path — it needs a fresh platform
 * dispatch (and a generation bump), not mail for the silenced self agent.
 */
export function shouldSteerFeedbackViaInbox(
  record: {
    state?: JobState;
    transitions?: JobTransition[];
    dispatch?: { refs?: readonly string[] } | null;
    builder?: BuilderKind;
    agentEndedAt?: string | null;
  },
  opts?: { builderChanging?: boolean; stall?: JobStall | null },
): boolean {
  if (opts?.builderChanging) return false;
  if (record.state === 'publishing') return false;
  if (!isActiveBuildRound(record)) return false;
  // A platform session that ended or stalled cannot collect another inbox note.
  if (
    (record.builder ?? 'platform') === 'platform' &&
    (record.agentEndedAt || opts?.stall === 'not_dispatched' || opts?.stall === 'quiet' || opts?.stall === 'ended')
  ) {
    return false;
  }
  return (record.dispatch?.refs?.length ?? 0) > 0;
}
