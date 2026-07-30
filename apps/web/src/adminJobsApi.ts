/**
 * The operator's build queue, and the one action taken against it.
 *
 * Every admin surface until now has been read-only telemetry. This one changes something:
 * publishing is the moderation boundary being exercised, and until it had a button it was
 * a curl command nobody could run from a phone at the moment a game needed approving.
 *
 * Same posture as `healthApi`: 404 means "not an admin" and is reported as such rather
 * than as an error, because the operator surface does not confirm its own existence.
 */

/** Internal job vocabulary — richer than what a creator is shown. Mirrors job-state.ts. */
export type JobState =
  | 'queued'
  | 'dispatched'
  | 'building'
  | 'submitted'
  | 'gating'
  | 'ready_for_review'
  | 'publishing'
  | 'published'
  | 'needs_changes'
  | 'failed'
  | 'canceled'
  | 'abandoned';

export type JobStall = 'awaiting_input' | 'not_dispatched' | 'quiet' | 'gate_not_started';

export interface JobQueueEntry {
  issueNumber: number;
  title: string;
  ownerUid: string;
  slug?: string;
  state: JobState;
  creatorStatus: string;
  stateSince?: string;
  timeInStateMs?: number;
  ageMs: number;
  stall: JobStall | null;
  agentState?: string;
  recentTransitions: Array<{ to: JobState; at: string; by: string; reason?: string }>;
}

export interface JobQueueResponse {
  jobs: JobQueueEntry[];
  byState: Partial<Record<JobState, number>>;
  stalled: number;
}

/** Null means "not an admin" (or no session): the route answers 404 to everyone else. */
export async function fetchJobQueue(): Promise<JobQueueResponse | null> {
  const response = await fetch('/api/admin/jobs', { credentials: 'include' });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error(`job queue failed: ${response.status}`);
  return (await response.json()) as JobQueueResponse;
}

export interface PublishResult {
  ok: true;
  slug: string;
  version: string;
  publishedAt: string;
}

/**
 * Why a publish was refused, in the API's own vocabulary.
 *
 * Kept as codes rather than sentences because each one means something an operator can
 * act on: `gate_red` is "look at the report", `not_gated` is "the gate has not run yet",
 * `nothing_delivered` is "this build never uploaded anything". A single "could not
 * publish" would collapse three different next steps into one shrug.
 */
export type PublishRefusal = 'gate_red' | 'not_gated' | 'nothing_delivered' | 'store_unavailable' | 'unknown';

export async function publishJob(issueNumber: number): Promise<PublishResult | { refused: PublishRefusal }> {
  const response = await fetch(`/api/admin/jobs/${issueNumber}/publish`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return (await response.json()) as PublishResult;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: PublishRefusal[] = ['gate_red', 'not_gated', 'nothing_delivered', 'store_unavailable'];
  const refusal = known.find((code) => code === body.error) ?? 'unknown';
  return { refused: refusal };
}
