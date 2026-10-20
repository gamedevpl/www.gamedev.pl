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
  // An end attempt settled: one success keeps the session ended for good.
  if (event === 'ended' || event === 'reopen') {
    if (!prev?.endedAt) return { state: null, outcome: 'ok' };
    const ending = Math.max(0, (prev.ending ?? 1) - 1);
    if (event === 'ended') return { state: put({ ...prev, ending, endConfirmed: true }), outcome: 'ok' };
    if (ending > 0 || prev.endConfirmed) return { state: put({ ...prev, ending }), outcome: 'ok' };
    const { endedAt: _endedAt, ending: _ending, ...open } = prev;
    return { state: put(open), outcome: 'ok' };
  }
  // A pending builder handoff is acknowledged by end, whatever ran.
  const handoff = record.builderHandoff;
  if (handoff?.awaitsAgentAck === true && !handoff.acknowledgedAt) return { state: null, outcome: 'pass' };
  if (runningIn(sessions, at) > 0) return { state: null, outcome: 'wait' };
  if (own.last === 'refused' && !own.delivered && !own.endRefused) {
    return { state: put({ ...own, endRefused: true }), outcome: 'refuse' };
  }
  const ending = (own.ending ?? 0) + 1;
  return { state: put({ ...own, endedAt: own.endedAt ?? at, ending }), outcome: 'ok' };
}
