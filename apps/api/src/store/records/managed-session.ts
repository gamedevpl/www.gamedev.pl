// A managed session's submit and end state, read by the guards.
export interface ManagedSessionState {
  sessionId: string;
  // Submits in flight, and when the latest one started.
  running?: number;
  submitAt?: string;
  last?: 'delivered' | 'refused';
  delivered?: true;
  endRefused?: true;
  endedAt?: string;
  // End attempts still running; a confirmed end is never rolled back.
  ending?: number;
  endConfirmed?: true;
}

// Every session of one round generation, by session id.
export interface ManagedSessions {
  generation: number;
  byId: Record<string, ManagedSessionState>;
}

export type ManagedSessionEvent = 'submit' | 'delivered' | 'refused' | 'end' | 'ended' | 'reopen';
// pass: handoff end, untracked. wait: submit running. ended: late submit.
export type ManagedSessionOutcome = 'ok' | 'pass' | 'wait' | 'refuse' | 'ended';
export type ManagedSessionStep = [
  jobId: number,
  roundGeneration: number,
  sessionId: string,
  event: ManagedSessionEvent,
  at: string,
];
