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

// Why a job looks stuck — stuck versus merely slow.
export const JOB_STALL_VALUES = [
  // Agent is explicitly blocked on an answer. Known, not inferred.
  'awaiting_input',
  // Accepted but never handed to an agent; dispatch itself wedged.
  'not_dispatched',
  // A live session that has said nothing for a while.
  'quiet',
  // Agent called MCP end; finished this round on purpose.
  'ended',
  // Delivered, but our own gate never picked it up.
  'gate_not_started',
  // Our gate build died without ever writing a verdict.
  'gate_crashed',
  // The vendor's own agent session errored on our last two checks in a row.
  'session_crashed',
  // A self-build round waiting for the creator's agent to connect.
  'no_agent_yet',
] as const;
export type JobStall = (typeof JOB_STALL_VALUES)[number];
