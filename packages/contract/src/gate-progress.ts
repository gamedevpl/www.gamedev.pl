// The four surfaces a build can be gated against.
export const GATE_PROGRESS_LANES = ['preview', 'publish', 'health', 'proposal'] as const;
export type GateProgressLane = (typeof GATE_PROGRESS_LANES)[number];

// Ordered milestones a gate run reports as it works.
export const GATE_PROGRESS_STAGES = [
  'preparing',
  'installing',
  'typecheck',
  'smoke',
  'build',
  'trace',
  'capture',
  'validate',
  'accept',
  'agent-play',
  'agency',
  'playtest',
] as const;

export type GateProgressStage = (typeof GATE_PROGRESS_STAGES)[number];

// How far a gate run has reached; cleared once a verdict lands.
export interface GateProgress {
  lane: GateProgressLane;
  stage: GateProgressStage;
  index: number;
  total: number;
  at: string;
}
