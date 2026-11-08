import type { BuilderKind } from '../../creation/builder.js';

export interface BuilderHandoff {
  from: BuilderKind;
  to: BuilderKind;
  requestedAt: string;
  awaitsAgentAck: boolean;
  acknowledgedAt?: string;
  // Who asked; the resumed round mounts their creator memory.
  requestedByUid?: string;
}

export type AgentEndedBy = 'submit' | 'end' | 'takeover';

// A closed round's generation and the delivery its gate judged.
export interface ReceiptRound {
  generation: number;
  version?: string;
}

// Why a generation closed; shown to its stale keys.
export interface RoundClosed {
  generation: number;
  reason: RoundClosedReason;
  at: string;
  // The job transition's own reason, when a transition closed it.
  detail?: string;
}

export type RoundClosedReason =
  | 'new_round'
  | 'creator_action'
  | 'builder_handoff'
  | 'gate_green'
  | 'session_finished'
  | 'session_failed'
  | 'credentials_revoked'
  | 'abandoned'
  | 'operator';
