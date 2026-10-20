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

type Sessions = ManagedSessions['byId'];

function runningOf(state: ManagedSessionState, at: string): number {
  const fresh = Date.parse(at) - Date.parse(state.submitAt ?? at) < RUNNING_SUBMIT_MS;
  return fresh ? (state.running ?? 0) : 0;
}

// Submits in flight from any session of the round.
function runningIn(sessions: Sessions, at: string): number {
  return Object.values(sessions).reduce((sum, state) => sum + runningOf(state, at), 0);
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
  const running = runningOf(own, at);
  // Kept until the round generation changes, so ended sessions stay ended.
  const put = (state: ManagedSessionState) => ({ generation, byId: { ...sessions, [state.sessionId]: state } });
  if (event === 'submit') {
    if (own.endedAt) return { state: null, outcome: 'ended' };
    return { state: put({ ...own, running: running + 1, submitAt: at }), outcome: 'ok' };
  }
  if (event === 'delivered' || event === 'refused') {
    if (!prev) return { state: null, outcome: 'ok' };
    const delivered = event === 'delivered' ? { delivered: true as const } : {};
    return { state: put({ ...own, running: Math.max(0, running - 1), last: event, ...delivered }), outcome: 'ok' };
  }
  // The channel refused that end: the session stays open.
  if (event === 'reopen') {
    if (!prev?.endedAt) return { state: null, outcome: 'ok' };
    const { endedAt: _endedAt, ...open } = prev;
    return { state: put(open), outcome: 'ok' };
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
