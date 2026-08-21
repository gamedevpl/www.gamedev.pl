// Editor-assist router outcome: which kind of request a creator utterance was.
export const ASSIST_LANES = ['params', 'content', 'code', 'reject'] as const;

export type AssistLane = (typeof ASSIST_LANES)[number];
