// When a finished session's green preview may close its round.

import type { SubmissionRecord } from '../platform/store.js';

// Only the current dispatch's own session may close the round.
export function currentSessionFinished(record: SubmissionRecord): boolean {
  const lastRef = record.dispatch?.refs.at(-1);
  if (!lastRef) return false;
  // agentState outlives rounds; the per-ref cost stamp does not.
  const session = record.costs?.find((entry) => entry.kind === 'agent_session' && entry.ref === lastRef);
  if (session?.state === 'completed') return true;
  // end() markers are round-scoped; the provider may still say idle.
  return record.agentState === 'idle' && Boolean(record.agentEndedAt) && record.agentEndedBy !== 'submit';
}
