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

import type { JobStall as ContractJobStall, JobState } from '@gamedevpl/contract';

export type { JobState };

// Admin/operator stalls, minus no_agent_yet — that one is self-build-round only.
export type JobStall = Exclude<ContractJobStall, 'no_agent_yet'>;

export interface JobQueueEntry {
  jobId: number;
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
export type PublishRefusal =
  'gate_red' | 'not_gated' | 'nothing_delivered' | 'profile_required' | 'store_unavailable' | 'unknown';

export async function publishJob(jobId: number): Promise<PublishResult | { refused: PublishRefusal }> {
  const response = await fetch(`/api/admin/jobs/${jobId}/publish`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return (await response.json()) as PublishResult;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: PublishRefusal[] = [
    'gate_red',
    'not_gated',
    'nothing_delivered',
    'profile_required',
    'store_unavailable',
  ];
  const refusal = known.find((code) => code === body.error) ?? 'unknown';
  return { refused: refusal };
}

export interface CancelResult {
  ok: true;
  state: 'canceled';
  /**
   * Whether the agent session was actually killed, or only told to stop. The Copilot
   * backend has no kill switch — false there is the honest answer, and the panel says
   * "told to stop" rather than "stopped" because of it.
   */
  stopEnforced: boolean;
}

export type CancelRefusal = 'already_finished' | 'mid_publish' | 'store_unavailable' | 'unknown';

export async function cancelJob(jobId: number): Promise<CancelResult | { refused: CancelRefusal }> {
  const response = await fetch(`/api/admin/jobs/${jobId}/cancel`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return (await response.json()) as CancelResult;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: CancelRefusal[] = ['already_finished', 'mid_publish', 'store_unavailable'];
  return { refused: known.find((code) => code === body.error) ?? 'unknown' };
}

export interface PublicationHealthCheck {
  version: string;
  requestedAt: string;
  buildId?: string;
  green?: boolean;
  verdictAt?: string;
  notifiedAt?: string;
}

export interface PublishedGame {
  slug: string;
  state: 'published' | 'archived' | 'disabled';
  currentVersion: string;
  publishedAt: string;
  healthCheck?: PublicationHealthCheck;
}

export async function fetchPublishedGames(): Promise<PublishedGame[] | null> {
  const response = await fetch('/api/admin/games', { credentials: 'include' });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error(`published games failed: ${response.status}`);
  return ((await response.json()) as { games: PublishedGame[] }).games;
}

export type RegateRefusal = 'not_published' | 'version_missing' | 'gate_unavailable' | 'store_unavailable' | 'unknown';

/** Starts a health re-gate of a published game against the current engine. */
export async function regateGame(slug: string): Promise<{ ok: true; buildId?: string } | { refused: RegateRefusal }> {
  const response = await fetch(`/api/admin/games/${encodeURIComponent(slug)}/regate`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return (await response.json()) as { ok: true; buildId?: string };
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: RegateRefusal[] = ['not_published', 'version_missing', 'gate_unavailable', 'store_unavailable'];
  return { refused: known.find((code) => code === body.error) ?? 'unknown' };
}

export type DeleteGameRefusal = 'not_published' | 'store_unavailable' | 'unknown';

export async function deleteGame(
  slug: string,
  reason?: string,
): Promise<{ ok: true } | { refused: DeleteGameRefusal }> {
  const response = await fetch(`/api/admin/games/${encodeURIComponent(slug)}/delete`, {
    method: 'POST',
    credentials: 'include',
    ...(reason ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) } : {}),
  });
  if (response.ok) return (await response.json()) as { ok: true };
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: DeleteGameRefusal[] = ['not_published', 'store_unavailable'];
  return { refused: known.find((code) => code === body.error) ?? 'unknown' };
}

export interface RetryResult {
  ok: true;
  state: 'building';
  /** A retry is a real agent session; the ledger books it whether or not it delivers. */
  creditsSpent: number;
}

export type RetryRefusal =
  | 'not_retryable'
  | 'never_dispatched'
  | 'dispatch_failed'
  | 'agent_backend_unavailable'
  | 'store_unavailable'
  | 'unknown';

export async function retryJob(jobId: number): Promise<RetryResult | { refused: RetryRefusal }> {
  const response = await fetch(`/api/admin/jobs/${jobId}/retry`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.ok) return (await response.json()) as RetryResult;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  const known: RetryRefusal[] = [
    'not_retryable',
    'never_dispatched',
    'dispatch_failed',
    'agent_backend_unavailable',
    'store_unavailable',
  ];
  return { refused: known.find((code) => code === body.error) ?? 'unknown' };
}

export interface JobPreview {
  slug: string;
  title: string;
  version: string;
  html: string;
}

export async function fetchJobPreview(jobId: number): Promise<JobPreview | null> {
  const response = await fetch(`/api/admin/jobs/${jobId}/preview`, { credentials: 'include' });
  if (!response.ok) return null;
  return (await response.json()) as JobPreview;
}
