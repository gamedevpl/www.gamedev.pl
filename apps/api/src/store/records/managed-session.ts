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
}

export type ManagedSessionEvent = 'submit' | 'delivered' | 'refused' | 'end';
// wait: submit running; refuse: end before any delivery; ended: late submit.
export type ManagedSessionOutcome = 'ok' | 'wait' | 'refuse' | 'ended';
export type ManagedSessionStep = [jobId: number, sessionId: string, event: ManagedSessionEvent, at: string];
