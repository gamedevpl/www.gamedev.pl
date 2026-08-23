// Shared vocabulary for the Code surface (creator-code-editing-execution-plan.md), used
// by both the status route (submissions.ts) and the Code surface's own routes
// (creator-code.ts). Kept in its own module rather than defined in either so the two
// cannot drift about what "available" or "read-only" means.

import { isActiveBuildRound } from './builder.js';
import { resolveJobState, type JobState, type JobTransition } from './job-state.js';

/**
 * CE-02: the Code surface's kill switch. Every model-facing and buffer-facing surface
 * in this codebase has one; this one ships **on** by owner decision (all creators from
 * M1), so the flag is a way to turn it *off* rather than a cohort gate to turn it on —
 * unset, or anything other than the literal string `'false'`, leaves it enabled.
 */
export function codeSurfaceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CODE_SURFACE !== 'false';
}

/**
 * Whether an agent is actively holding this round's buffer.
 *
 * The same "live" test `shouldSteerFeedbackViaInbox` (builder.ts) uses for inbox
 * steering: an active round with a dispatched session that has not explicitly ended.
 * Reused here for the Code surface's read-only gate (CE-05's `codeSurface.readOnly`,
 * CE-10's owner staging routes) — a live agent round locks owner writes the same way a
 * manual round is meant to lock agent dispatch (CE-17).
 */
export function isLiveAgentRound(record: {
  state?: JobState;
  lastStatus?: Parameters<typeof resolveJobState>[0]['lastStatus'];
  transitions?: JobTransition[];
  dispatch?: { refs?: readonly string[] } | null;
  agentEndedAt?: string;
}): boolean {
  if (record.agentEndedAt) return false;
  // Same "unset means queued" reading every other consumer of job state uses — a
  // round nobody has ever transitioned is not the same thing as a closed one.
  const state = resolveJobState(record) ?? 'queued';
  if (!isActiveBuildRound({ state, transitions: record.transitions })) return false;
  return (record.dispatch?.refs?.length ?? 0) > 0;
}

// Could an agent write? No dispatch.refs; agentEndedAt self-clears.
export function isOpenAgentRound(record: {
  state?: JobState;
  lastStatus?: Parameters<typeof resolveJobState>[0]['lastStatus'];
  transitions?: JobTransition[];
}): boolean {
  const state = resolveJobState(record) ?? 'queued';
  return isActiveBuildRound({ state, transitions: record.transitions });
}
