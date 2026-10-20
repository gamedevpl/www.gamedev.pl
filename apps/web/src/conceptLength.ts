// Mirrors the submission route's own concept minimum.
export const MIN_CONCEPT_LENGTH = 30;

// And its maximum.
export const MAX_CONCEPT_LENGTH = 4000;

export function isSubmittableConcept(concept: string): boolean {
  return concept.trim().length >= MIN_CONCEPT_LENGTH;
}
