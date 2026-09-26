// When a finished session's green preview may close its round.

import type { SubmissionRecord } from '../platform/store.js';

// Only the current dispatch's own session may close the round.
export function currentSessionFinished(record: SubmissionRecord): boolean {
  const lastRef = record.dispatch?.refs.at(-1);
  if (!lastRef) return false;
  // The per-ref cost stamp, or a state observed for this ref.
  const session = record.costs?.find((entry) => entry.kind === 'agent_session' && entry.ref === lastRef);
  const observedHere = record.agentStateRef === lastRef && record.agentState === 'completed';
  if (session?.state === 'completed' || observedHere) return true;
  // An explicit end() this round; submit and takeover markers are not one.
  return Boolean(record.agentEndedAt) && record.agentEndedBy !== 'submit' && record.agentEndedBy !== 'takeover';
}
