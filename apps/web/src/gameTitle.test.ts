import { describe, expect, it } from 'vitest';
import { deriveTitleFromConcept, isSubmittableTitle } from './gameTitle.js';

/**
 * The fallback namer, which only runs when the refiner had nothing to offer.
 *
 * Its predecessor was `concept.slice(0, 40)`, and its output became the game's real
 * name everywhere — "A game tycoon like where I run a tv busi" is a production example.
 * These pin the two things that made that bad: cutting mid-word, and reading as a
 * sentence fragment rather than a name.
 */
describe('deriveTitleFromConcept', () => {
  it('keeps the opening clause and stops at the first sentence end', () => {
    expect(deriveTitleFromConcept('A tower defence game. You place turrets on a grid.')).toBe('A tower defence game');
  });

  it('cuts at a word boundary rather than mid-word', () => {
    const title = deriveTitleFromConcept('A game tycoon like where I run a tv business with presenters and ratings');
    expect(title.endsWith('busi')).toBe(false);
    // Whatever the budget is, the result has to be whole words.
    expect(title.split(' ').every((word) => word.length > 0)).toBe(true);
    expect('A game tycoon like where I run a tv business with presenters and ratings').toContain(title);
  });

  it('collapses newlines and runs of whitespace', () => {
    expect(deriveTitleFromConcept('  Space   miner\n\nwith upgrades  ')).toBe('Space miner');
  });

  it('has nothing to offer for an empty concept, and says so', () => {
    // Empty rather than invented: an empty box the creator must fill beats a name
    // they never chose, and the create button is disabled until they do.
    expect(deriveTitleFromConcept('   ')).toBe('');
    expect(deriveTitleFromConcept('...')).toBe('');
  });
});

describe('isSubmittableTitle', () => {
  it('matches the API bounds, so a suggestion is never rejected on arrival', () => {
    expect(isSubmittableTitle('ab')).toBe(false);
    expect(isSubmittableTitle('   ')).toBe(false);
    expect(isSubmittableTitle('TV Tycoon')).toBe(true);
    expect(isSubmittableTitle('x'.repeat(80))).toBe(true);
    expect(isSubmittableTitle('x'.repeat(81))).toBe(false);
  });
});
