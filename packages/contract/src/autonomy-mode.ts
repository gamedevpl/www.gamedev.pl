// How much the improvement loop may do without a human.
export const AUTONOMY_MODES = [
  // Never act, and do not even raise a card.
  'digest-only',
  // Propose; a human decides. The default until told otherwise.
  'suggest',
  // Defects may be worked on unasked, no human needed.
  'auto-fix-defects',
  // Defects and friction, inside the spec the creator approved.
  'auto-tune',
] as const;

export type AutonomyMode = (typeof AUTONOMY_MODES)[number];
