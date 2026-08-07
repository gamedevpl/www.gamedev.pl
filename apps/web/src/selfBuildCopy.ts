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

export type SelfStatusCopy = 'no_agent_yet' | 'quiet_agent' | 'agent_ended' | 'delivery_cap';

/** Where a self-round composer message will actually go. */
export type SelfComposerRoute = 'active' | 'waiting';

export type SelfBuildCopyInput = {
  builder?: 'platform' | 'self' | null;
  stall?: 'awaiting_input' | 'not_dispatched' | 'quiet' | 'ended' | 'gate_not_started' | 'no_agent_yet' | null;
  failureReason?: string | null;
  /**
   * Internal job phase when the coarse status is lossy. Gate-green drafts project as
   * `in_review` / `ready_for_review` with no live session — copy must not claim a check-in.
   */
  phase?: string | null;
  /** When set, the agent called MCP `end` (even if stall is later `gate_not_started`). */
  agentEndedAt?: string | null;
};

/**
 * Which self-build status sentence (if any) the thread should show.
 *
 * Delivery-cap outranks stall: the round cannot accept more deliveries, and a quiet
 * banner would misread that as "the agent wandered off".
 * `gate_not_started` keeps the generic stall warning (ops-side); `agentEndedAt` alone
 * still maps to `agent_ended` when stall is not already something stronger.
 */
export function selfStatusCopy(input: SelfBuildCopyInput): SelfStatusCopy | null {
  if (input.failureReason === 'self_build_delivery_cap') return 'delivery_cap';
  if (input.builder !== 'self') return null;
  if (input.stall === 'no_agent_yet') return 'no_agent_yet';
  if (
    input.stall === 'ended' ||
    (input.agentEndedAt && input.stall !== 'gate_not_started' && input.stall !== 'quiet')
  ) {
    return 'agent_ended';
  }
  if (input.stall === 'quiet') return 'quiet_agent';
  return null;
}

/**
 * Whether the connect card belongs on screen.
 *
 * Shown before the first agent signal, and again when a connected agent has gone
 * quiet — gamedev.pl cannot wake it, so the paste-ready prompt is the resume path.
 *
 * Not shown after a green gate (`ready_for_review`): the round closed and the
 * connect endpoint returns `inactive_round`, so mounting the card only produced a
 * red "could not load connect steps" while ChatGPT correctly said Done. Gate-green
 * is Final check / waiting to publish — not a reconnect moment.
 *
 * Not shown after MCP `end` (`ended`): the agent finished on purpose — handoff /
 * composer note, not reconnect.
 *
 * Quiet uses {@link connectCardMode} `resume` (kickoff-first), not the full
 * first-time MCP install chrome.
 */
export function shouldShowConnectCard(input: SelfBuildCopyInput): boolean {
  // Gate-green closes the round (connect → inactive_round). A stale `quiet` stall
  // can still be on the status snapshot — do not resurface reconnect over "Done".
  if (input.phase === 'ready_for_review') return false;
  const copy = selfStatusCopy(input);
  return copy === 'no_agent_yet' || copy === 'quiet_agent';
}

/** Shape of the connect card when it is on screen, or null when it should not show. */
export type ConnectCardMode = 'setup' | 'resume';

/**
 * First attach gets the full install + kickoff. Quiet already had a connection —
 * show the continue prompt first and send MCP re-install to Details.
 */
export function connectCardMode(input: SelfBuildCopyInput): ConnectCardMode | null {
  if (!shouldShowConnectCard(input)) return null;
  if (selfStatusCopy(input) === 'no_agent_yet') return 'setup';
  return 'resume';
}

/**
 * Composer routing for a self round, or null when the platform is building / the
 * composer should not be on screen.
 *
 * Pre-first-signal hides the composer; later states keep the note composer available.
 *
 * Gate-green (`ready_for_review`) closes the round and retires the session key, so
 * claiming a next check-in would be a lie — route as waiting even with a stale stall.
 */
export function selfComposerRoute(input: SelfBuildCopyInput): SelfComposerRoute | null {
  if (input.builder !== 'self') return null;
  if (input.stall === 'no_agent_yet') return null;
  if (input.failureReason === 'self_build_delivery_cap') return 'waiting';
  if (input.phase === 'ready_for_review') return 'waiting';
  if (input.stall === 'quiet' || input.stall === 'ended' || input.agentEndedAt) return 'waiting';
  return 'active';
}
