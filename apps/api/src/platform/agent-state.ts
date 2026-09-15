// The vendor-neutral vocabulary every agent backend reports in.

export const AGENT_TASK_STATES = [
  'queued',
  'in_progress',
  'completed',
  'failed',
  'idle',
  'waiting_for_user',
  'timed_out',
  'cancelled',
] as const;

export type AgentTaskState = (typeof AGENT_TASK_STATES)[number];

const AGENT_TASK_STATE_SET: ReadonlySet<string> = new Set(AGENT_TASK_STATES);

export function isAgentTaskState(value: unknown): value is AgentTaskState {
  return typeof value === 'string' && AGENT_TASK_STATE_SET.has(value);
}

// Nothing further will be charged to this ref once settled.
export function isSettledAgentState(state: AgentTaskState): boolean {
  return state === 'completed' || state === 'failed' || state === 'timed_out' || state === 'cancelled';
}
