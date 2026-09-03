// Submission lifecycle state — same seven values on API and web.
export const SUBMISSION_STATES = [
  'queued',
  'building',
  'in_review',
  'publishing',
  'published',
  'needs_changes',
  'abandoned',
] as const;

export type SubmissionState = (typeof SUBMISSION_STATES)[number];

// Still moving: what shelf and badge both call a live build.
export const SUBMISSION_IN_FLIGHT_STATES = ['queued', 'building', 'in_review', 'publishing'] as const;

// An unknown status is too young to derive, so it counts.
export function isSubmissionInFlight(status: SubmissionState | null | undefined): boolean {
  return status == null || (SUBMISSION_IN_FLIGHT_STATES as readonly string[]).includes(status);
}
