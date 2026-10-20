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
