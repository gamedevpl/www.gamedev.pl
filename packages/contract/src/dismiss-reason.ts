// Why a creator waved off an improvement suggestion.
export const DISMISS_REASONS = [
  // The evidence is real but the game means it.
  'intentional',
  // The evidence does not describe a real problem.
  'not-a-problem',
  // Real, but not worth changing the game over.
  'wont-fix',
  // Real and worth doing, just not right now.
  'not-now',
  // The numbers look wrong, which indicts the router itself.
  'bad-evidence',
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];
