/**
 * The submission route's own concept bound, mirrored here.
 *
 * A concept under this length used to sail past the hero prompt and the whole
 * confirm wizard unnoticed — the spec refiner call fails the same server-side
 * check, but that call is intentionally fail-open (an outage must not block
 * creation), so the failure came back indistinguishable from "already fully
 * specified, zero questions" and the creator only met the real validation
 * error on "Stwórz teraz" / "Create now", three steps and a signed-in build
 * request later. Checking here, before any of that starts, is the circuit
 * breaker: too little to build from is caught immediately, in the same box
 * the creator is still looking at.
 */
export const MIN_CONCEPT_LENGTH = 30;

export function isSubmittableConcept(concept: string): boolean {
  return concept.trim().length >= MIN_CONCEPT_LENGTH;
}
