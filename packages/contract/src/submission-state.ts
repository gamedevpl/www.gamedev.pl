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
