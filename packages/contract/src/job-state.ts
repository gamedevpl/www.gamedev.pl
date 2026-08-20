// Internal job vocabulary — richer than the public SubmissionState.
export const JOB_STATES = [
  // Accepted and paid for out of quota; not dispatched yet.
  'queued',
  // Handed to an agent backend; work hasn't started yet.
  'dispatched',
  // An agent session is actively working.
  'building',
  // Agent delivered candidate sources; nothing has verified them yet.
  'submitted',
  // Our gate runs against delivered sources; never actually observed here.
  'gating',
  // Gate green; waiting on the human moderation review.
  'ready_for_review',
  // Approved; the snapshot bake is in flight.
  'publishing',
  // Live on the site. Terminal.
  'published',
  // Bounced back for another round — gate red or reviewer rejected.
  'needs_changes',
  // Agent failed, timed out, or never delivered. Terminal for the round.
  'failed',
  // Stopped by the creator or the operator. Terminal.
  'canceled',
  // Creator walked away. Terminal, distinct from canceled for reporting.
  'abandoned',
] as const;
export type JobState = (typeof JOB_STATES)[number];
