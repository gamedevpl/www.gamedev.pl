// The four surfaces a build can be gated against.
export const GATE_PROGRESS_LANES = ['preview', 'publish', 'health', 'proposal'] as const;
export type GateProgressLane = (typeof GATE_PROGRESS_LANES)[number];
