import { describe, expect, it } from 'vitest';
import { isSubmittableConcept, MIN_CONCEPT_LENGTH } from './conceptLength.js';

describe('isSubmittableConcept', () => {
  it('matches the API bound, so the circuit breaker fires exactly where the server would reject', () => {
    expect(isSubmittableConcept('Brawl Stars Clone')).toBe(false);
    expect(isSubmittableConcept('x'.repeat(MIN_CONCEPT_LENGTH - 1))).toBe(false);
    expect(isSubmittableConcept('x'.repeat(MIN_CONCEPT_LENGTH))).toBe(true);
  });

  it('trims before measuring, so padding cannot fake a submittable concept', () => {
    expect(isSubmittableConcept(`  ${'x'.repeat(MIN_CONCEPT_LENGTH - 1)}  `)).toBe(false);
  });
});
