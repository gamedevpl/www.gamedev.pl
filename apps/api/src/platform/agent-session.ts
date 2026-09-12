export interface AgentSessionRecord {
  agentEndedAt?: string | null;
  agentEndedBy?: 'submit' | 'end';
  agentState?: string;
}

const TERMINAL_AGENT_STATES = ['completed', 'failed', 'timed_out', 'cancelled'];

// A submit marker means the session lives on; agents skip end.
export function isAgentSessionEnded(record: AgentSessionRecord): boolean {
  if (!record.agentEndedAt) return false;
  const terminalAgent = TERMINAL_AGENT_STATES.includes(record.agentState ?? '');
  return !(record.agentEndedBy === 'submit' && !terminalAgent);
}
