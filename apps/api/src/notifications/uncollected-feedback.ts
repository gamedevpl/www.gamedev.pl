import type { JobState } from '@gamedevpl/contract';

export type UncollectedFeedbackCause =
  'awaiting_gate' | 'awaiting_operator' | 'agent_ended' | 'no_agent_yet' | 'agent_expected';

export interface UncollectedFeedbackRecord {
  builder?: string;
  defaultBuilder?: string;
  state?: JobState;
  lastAgentSignalAt?: string;
  agentEndedAt?: string;
}

const AWAITING_OPERATOR: ReadonlySet<JobState> = new Set(['ready_for_review', 'publishing']);
const BEFORE_ANY_SESSION: ReadonlySet<JobState> = new Set(['queued', 'dispatched']);

// Why nothing collected it: which verb the operator needs.
export function uncollectedFeedbackCause(record: UncollectedFeedbackRecord): UncollectedFeedbackCause {
  const state = record.state;
  if (state === 'submitted') return 'awaiting_gate';
  if (state && AWAITING_OPERATOR.has(state)) return 'awaiting_operator';
  if (record.agentEndedAt) return 'agent_ended';
  if (!record.lastAgentSignalAt && (!state || BEFORE_ANY_SESSION.has(state))) return 'no_agent_yet';
  return 'agent_expected';
}
