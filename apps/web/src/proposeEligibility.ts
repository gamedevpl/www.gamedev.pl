import { checkContributions, type ProposalApiError } from './proposalsApi.js';

// Refusal codes with their own sentence; anything else reads as generic.
const KNOWN_ERRORS = new Set([
  'contributions_off',
  'own_game',
  'not_published',
  'too_many_open',
  'rate_limited',
  'content_rejected',
]);

// One eligibility answer per signed-in player and game, per page load.
const eligibilityCache = new Map<string, Promise<boolean>>();

// Test seam: forget cached eligibility answers.
export function resetProposeEligibilityCache(): void {
  eligibilityCache.clear();
}

export function canProposeTo(uid: string, slug: string): Promise<boolean> {
  const key = `${uid}:${slug}`;
  let pending = eligibilityCache.get(key);
  if (!pending) {
    // A failed check hides the control rather than offering a dead end.
    pending = checkContributions(slug).then(
      (answer) => answer.canPropose === true,
      () => false,
    );
    eligibilityCache.set(key, pending);
  }
  return pending;
}

// Maps an API refusal onto the sentence the player reads.
export function proposeErrorKey(error: unknown): string {
  const { status, code } = (error ?? {}) as ProposalApiError;
  if (status === 401) return 'propose.errors.signed_out';
  if (code && KNOWN_ERRORS.has(code)) return `propose.errors.${code}`;
  return 'propose.errors.generic';
}
