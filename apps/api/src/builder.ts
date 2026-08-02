// Which coding agent builds a round: the platform's (Copilot) or the creator's own.
//
// A property of the *round*, not the game. The game keeps a default (= last used) so the
// next round can offer a sensible choice; an active round never switches mid-flight.

import type { JobState, JobTransition } from './job-state.js';

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

/**
 * Whether the current round is still live — builder must not change until it closes.
 *
 * Includes gate-red / kit_outdated `needs_changes`: those keep the round open so the
 * same session can repair (or refresh the kit) and re-deliver without a new kickoff.
 */
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

/**
 * Whether creator feedback should only go to the build-channel inbox (no new dispatch).
 *
 * An in-flight round ({@link isActiveBuildRound}) that already has a dispatch ref has an
 * agent that will poll the inbox — including after delivery while the gate runs, and on
 * gate-red / kit_outdated repair, where the same session is often still alive. Starting
 * another Copilot task on top of that is what produced concurrent builds of one game.
 *
 * A `queued` job with **no** refs is different: dispatch never landed, so nobody will
 * read the inbox. Feedback must retry `resumeBuild` in that case.
 */
export function shouldSteerFeedbackViaInbox(record: {
  state?: JobState;
  transitions?: JobTransition[];
  dispatch?: { refs?: readonly string[] } | null;
}): boolean {
  if (!isActiveBuildRound(record)) return false;
  return (record.dispatch?.refs?.length ?? 0) > 0;
}
