import type { JobState, JobTransition } from '../creation/job-state.js';

// When an open round nobody has touched gets closed by the sweep.

// Same shape as the self-build connect window: the sweep needs it.
export const DEFAULT_QUIET_ROUND_DAYS = 14;

export function quietRoundDays(): number {
  const parsed = Number(process.env.QUIET_ROUND_DAYS ?? DEFAULT_QUIET_ROUND_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_QUIET_ROUND_DAYS;
}

// Closable states; the rest are waiting on us.
const QUIET_CLOSABLE: ReadonlySet<JobState> = new Set([
  'queued',
  'dispatched',
  'building',
  'submitted',
  'needs_changes',
]);

// Newest stamp anyone left; creation stamps only for a never-adopted record.
export function lastRoundActivityAt(record: {
  createdAt: string;
  roundStartedAt?: string;
  stateSince?: string;
  lastAgentSignalAt?: string;
  agentEndedAt?: string;
  transitions?: JobTransition[];
}): number {
  const newest = (stamps: (string | undefined)[]) =>
    Math.max(...stamps.map((stamp) => (stamp ? Date.parse(stamp) : NaN)).filter(Number.isFinite));
  const lived = newest([
    record.stateSince,
    record.lastAgentSignalAt,
    record.agentEndedAt,
    record.transitions?.at(-1)?.at,
  ]);
  return Number.isFinite(lived) ? lived : newest([record.roundStartedAt, record.createdAt]);
}

// Quiet from every side for the window: close, or carry forever.
export function shouldAutoAbandonQuietRound(input: {
  state?: JobState;
  abandonedAt?: string;
  lastActivityAt: number;
  now: number;
  quietDays: number;
}): boolean {
  if (input.abandonedAt) return false;
  // A never-adopted record is judged by its timestamps alone.
  if (input.state && !QUIET_CLOSABLE.has(input.state)) return false;
  if (!Number.isFinite(input.lastActivityAt)) return false;
  return input.now - input.lastActivityAt >= input.quietDays * 24 * 60 * 60 * 1000;
}
