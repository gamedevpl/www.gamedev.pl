/**
 * Honest status / composer copy for self-build rounds (BY-08).
 *
 * The platform cannot start or wake the creator's agent. Status copy and the
 * composer's routing note must say so: waiting-to-connect, quiet after a signal,
 * delivery-cap reached, and — after a send — whether a running agent will see the
 * note on its next check-in or only once the creator starts it again.
 *
 * Pure functions so the selection is unit-tested without mounting Studio.
 */

export type SelfStatusCopy = 'no_agent_yet' | 'quiet_agent' | 'delivery_cap';

/** Where a self-round composer message will actually go. */
export type SelfComposerRoute = 'active' | 'waiting';

export type SelfBuildCopyInput = {
  builder?: 'platform' | 'self' | null;
  stall?: 'awaiting_input' | 'not_dispatched' | 'quiet' | 'gate_not_started' | 'no_agent_yet' | null;
  failureReason?: string | null;
  /**
   * Internal job phase when the coarse status is lossy. Gate-green drafts project as
   * `in_review` / `ready_for_review` with no live session — copy must not claim a check-in.
   */
  phase?: string | null;
};

/**
 * Which self-build status sentence (if any) the thread should show.
 *
 * Delivery-cap outranks stall: the round cannot accept more deliveries, and a quiet
 * banner would misread that as "the agent wandered off".
 */
export function selfStatusCopy(input: SelfBuildCopyInput): SelfStatusCopy | null {
  if (input.failureReason === 'self_build_delivery_cap') return 'delivery_cap';
  if (input.builder !== 'self') return null;
  if (input.stall === 'no_agent_yet') return 'no_agent_yet';
  if (input.stall === 'quiet') return 'quiet_agent';
  return null;
}

/**
 * Whether the connect card belongs on screen.
 *
 * Shown before the first agent signal, and again when a connected agent has gone
 * quiet — gamedev.pl cannot wake it, so the paste-ready prompt is the resume path.
 * Also shown after a green gate closes the round: Studio still looks "live", but no
 * session will check the inbox until the creator starts their agent again.
 */
export function shouldShowConnectCard(input: SelfBuildCopyInput): boolean {
  const copy = selfStatusCopy(input);
  if (copy === 'no_agent_yet' || copy === 'quiet_agent') return true;
  return input.builder === 'self' && input.phase === 'ready_for_review';
}

/**
 * Composer routing for a self round, or null when the platform is building.
 *
 * `waiting` covers both pre-first-signal and quiet — the message is saved, but no
 * agent will see it until the creator starts theirs. `active` means a recent signal
 * so the next check-in will pick the inbox up.
 *
 * Gate-green (`ready_for_review`) closes the round and retires the session key, so
 * claiming a next check-in would be a lie — route as waiting even with a stale stall.
 */
export function selfComposerRoute(input: SelfBuildCopyInput): SelfComposerRoute | null {
  if (input.builder !== 'self') return null;
  if (input.failureReason === 'self_build_delivery_cap') return 'waiting';
  if (input.phase === 'ready_for_review') return 'waiting';
  if (input.stall === 'no_agent_yet' || input.stall === 'quiet') return 'waiting';
  return 'active';
}
