// The pure managed-session transition both stores run.
import type { SubmissionRecord } from '../records/submission.js';
import type {
  ManagedSessionEvent,
  ManagedSessionOutcome,
  ManagedSessionState,
  ManagedSessions,
} from '../records/managed-session.js';

// Submits still marked running after this long are taken as lost.
const RUNNING_SUBMIT_MS = 90_000;

// Sessions kept per round; the oldest drop first.
const MAX_SESSIONS = 8;

type Sessions = ManagedSessions['byId'];

// Submits in flight from any session of the round.
function runningIn(sessions: Sessions, at: string): number {
  return Object.values(sessions).reduce((sum, state) => {
    const fresh = Date.parse(at) - Date.parse(state.submitAt ?? at) < RUNNING_SUBMIT_MS;
    return sum + (fresh ? (state.running ?? 0) : 0);
  }, 0);
}

function withSession(sessions: Sessions, state: ManagedSessionState): Sessions {
  const kept = Object.entries({ ...sessions, [state.sessionId]: state }).slice(-MAX_SESSIONS);
  return Object.fromEntries(kept);
}

// Pure step: a null state leaves the record unchanged.
export function nextManagedSession(
  record: Pick<SubmissionRecord, 'managedSessions' | 'builderHandoff'>,
  generation: number,
  sessionId: string,
  event: ManagedSessionEvent,
  at: string,
): { state: ManagedSessions | null; outcome: ManagedSessionOutcome } {
  const stored = record.managedSessions;
  const sessions = stored?.generation === generation ? stored.byId : {};
  const prev = sessions[sessionId];
  const own = prev ?? { sessionId };
  const fresh = Date.parse(at) - Date.parse(own.submitAt ?? at) < RUNNING_SUBMIT_MS;
  const running = fresh ? (own.running ?? 0) : 0;
  const put = (state: ManagedSessionState) => ({ generation, byId: withSession(sessions, state) });
  if (event === 'submit') {
    if (own.endedAt) return { state: null, outcome: 'ended' };
    return { state: put({ ...own, running: running + 1, submitAt: at }), outcome: 'ok' };
  }
  if (event === 'delivered' || event === 'refused') {
    if (!prev) return { state: null, outcome: 'ok' };
    const delivered = event === 'delivered' ? { delivered: true as const } : {};
    return { state: put({ ...own, running: Math.max(0, running - 1), last: event, ...delivered }), outcome: 'ok' };
  }
  // A pending builder handoff is acknowledged by end, whatever ran.
  const handoff = record.builderHandoff;
  if (handoff?.awaitsAgentAck === true && !handoff.acknowledgedAt) return { state: null, outcome: 'ok' };
  if (runningIn(sessions, at) > 0) return { state: null, outcome: 'wait' };
  if (own.last === 'refused' && !own.delivered && !own.endRefused) {
    return { state: put({ ...own, endRefused: true }), outcome: 'refuse' };
  }
  return { state: put({ ...own, endedAt: at }), outcome: 'ok' };
}
