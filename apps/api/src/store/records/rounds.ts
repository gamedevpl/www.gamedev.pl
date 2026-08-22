import type { BuilderKind } from '../../builder.js';

export interface BuilderHandoff {
  from: BuilderKind;
  to: BuilderKind;
  requestedAt: string;
  awaitsAgentAck: boolean;
  acknowledgedAt?: string;
}

export type AgentEndedBy = 'submit' | 'end';
