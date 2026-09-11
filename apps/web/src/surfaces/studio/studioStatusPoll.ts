import type { SubmissionStatus } from '../../submissionApi.js';

/**
 * Status-page poll cadence helpers.
 *
 * Kept out of {@link SubmissionStatusView} so that file only exports components
 * (react-refresh) while tests can still assert the real intervals.
 */

// `in_review` omitted: gate-green waits on a human, not the agent.
// Tight polling + foot spinner made "Final check" look eternally in progress.
const ACTIVE_BUILD_STATUSES = new Set<SubmissionStatus['status']>(['building']);

/** Exported so tests advance timers by the real cadence. */
export const ACTIVE_POLL_MS = 3000;
const IDLE_POLL_MS = 10000;

export function pollDelayMs(
  status: SubmissionStatus['status'],
  stall?: SubmissionStatus['stall'],
  phase?: SubmissionStatus['phase'],
): number | null {
  // `needs_changes` is terminal for the *round*, not for the page: feedback from here
  // starts another round, and stopping the poll meant the UI kept saying "needs changes"
  // after a successful send until the creator refreshed. Published and abandoned are
  // finished for good — nothing the composer can do moves them.
  if (status === 'published' || status === 'abandoned') return null;
  if (status === 'needs_changes') return IDLE_POLL_MS;
  // Flip the connect card to live progress as soon as the agent signals.
  if (stall === 'no_agent_yet') return ACTIVE_POLL_MS;
  // Resume after end/quiet: pick up MCP start in ~3s, not 10s.
  if (stall === 'ended' || stall === 'quiet') return ACTIVE_POLL_MS;
  // Copilot session boot: job is `dispatched` (public status still `queued`) until
  // GitHub reports `in_progress`. Poll tightly on that real phase — not a timer guess.
  if (phase === 'dispatched') return ACTIVE_POLL_MS;
  return ACTIVE_BUILD_STATUSES.has(status) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
