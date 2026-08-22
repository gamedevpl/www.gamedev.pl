/**
 * Naming a game when the refiner could not.
 *
 * The suggestion normally comes from the model that already read the concept. This is
 * the fallback for the cases where it did not answer — a timeout, an outage, a reply
 * with nothing usable in it — and it exists because the naming step is not optional:
 * a build that starts without a confirmed name is how games ended up called
 * "A game tycoon like where I run a tv busi", the prompt's first 40 characters cut
 * mid-word and then carried by the game everywhere, forever.
 *
 * What it produces is a starting point in a text box the creator is looking at, not a
 * final answer, so it aims to be tidy rather than clever: the opening clause, cut at a
 * word boundary.
 */

/** Matches the submission route's own bounds, so a suggestion is always submittable. */
import { MAX_TITLE_LENGTH } from '@gamedevpl/contract';
export const MIN_TITLE_LENGTH = 3;
export { MAX_TITLE_LENGTH };

/** How much of the opening clause to keep. Long enough to be recognisable as theirs. */
const FALLBACK_TITLE_LENGTH = 48;

/**
 * A title derived from the concept, or '' when there is nothing to derive one from.
 *
 * Empty is a real answer: an empty box the creator must fill is better than a name
 * they did not choose and might not notice, and the create button stays disabled
 * until it holds something either way.
 */
export function deriveTitleFromConcept(concept: string): string {
  const firstClause = concept
    .trim()
    // Stop at the first sentence or line break — later sentences are elaboration, and
    // the opening one is almost always "a game where you …".
    .split(/[\n.!?]/)[0]
    ?.trim();
  if (!firstClause) return '';

  const collapsed = firstClause.replace(/\s+/g, ' ');
  if (collapsed.length <= FALLBACK_TITLE_LENGTH) return collapsed;

  // Cut at the last word boundary that fits rather than mid-word. A word longer than
  // the whole budget has no boundary to find, so it is cut where it lands.
  const clipped = collapsed.slice(0, FALLBACK_TITLE_LENGTH);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > MIN_TITLE_LENGTH ? clipped.slice(0, lastSpace) : clipped).trim();
}

/** Whether this title can be submitted as-is — the same bounds the API enforces. */
export function isSubmittableTitle(title: string): boolean {
  const trimmed = title.trim();
  return trimmed.length >= MIN_TITLE_LENGTH && trimmed.length <= MAX_TITLE_LENGTH;
}
