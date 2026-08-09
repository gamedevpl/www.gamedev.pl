import { describe, expect, it } from 'vitest';
import { isSubmittableConcept, MIN_CONCEPT_LENGTH } from './conceptLength.js';

describe('isSubmittableConcept', () => {
  it('matches the API bound, so the circuit breaker fires exactly where the server would reject', () => {
    // The real report this guards: "Brawl Stars Clone" (18 chars) sailed past this
    // check when it did not exist, through the whole naming/QA wizard with zero
    // questions asked, and only failed on the final "Create now".
    expect(isSubmittableConcept('Brawl Stars Clone')).toBe(false);
    expect(isSubmittableConcept('x'.repeat(MIN_CONCEPT_LENGTH - 1))).toBe(false);
    expect(isSubmittableConcept('x'.repeat(MIN_CONCEPT_LENGTH))).toBe(true);
  });

  it('trims before measuring, so padding cannot fake a submittable concept', () => {
    expect(isSubmittableConcept(`  ${'x'.repeat(MIN_CONCEPT_LENGTH - 1)}  `)).toBe(false);
  });
});
