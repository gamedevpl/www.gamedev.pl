import type { AssessmentResolutionStatus, ReReviewRequestStatus } from '@gamedevpl/contract';
import type {
  AssessmentChecklist,
  AssessmentClientContext,
  AssessmentNoteOrigin,
  AssessmentSource,
  AssessmentVerdict,
} from './reviewTypes.js';

const API_BASE = '';

export interface ReviewQueueMedia {
  screenshots: Array<{ name: string; file: string }>;
  video: string | null;
}

export interface ReviewQueueItem {
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  genre: string | null;
  jobId: number | null;
  media: ReviewQueueMedia | null;
  // Set when an operator targeted this slug for re-review.
  reReview?: { reason: string | null; gameVersion: string | null; requestedAt: string } | null;
}

export interface ReviewQueueSweepHint {
  id: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  total: number;
  released: number;
}

export interface ReviewQueueResponse {
  source: 'catalog' | 'creator' | 'all';
  remaining: number;
  assessed: number;
  items: ReviewQueueItem[];
  sweep?: ReviewQueueSweepHint | null;
  emptyReason?: 'no_active_sweep' | 'sweep_paused' | 'queue_clear' | null;
}

// Operator follow-up; null until someone acts on it.
export interface AssessmentResolution {
  status: AssessmentResolutionStatus;
  comment: string;
  link: string | null;
  resolvedAt: string;
  resolvedBy: string;
}

export interface GameAssessment {
  id: string;
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  reviewerUid: string;
  verdict: AssessmentVerdict;
  note: string;
  noteOrigin: AssessmentNoteOrigin;
  checklist: AssessmentChecklist | null;
  clientContext: AssessmentClientContext | null;
  // The deployed game version this verdict judged.
  gameVersion: string | null;
  resolution: AssessmentResolution | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitAssessmentInput {
  slug: string;
  source: AssessmentSource;
  title?: string;
  creatorHandle?: string | null;
  verdict: AssessmentVerdict;
  note: string;
  noteOrigin?: Exclude<AssessmentNoteOrigin, 'none'>;
  checklist: AssessmentChecklist;
  clientContext?: AssessmentClientContext | null;
  gameVersion?: string | null;
}

export class ReviewApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ReviewApiError';
    this.status = status;
  }
}

export async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? '';
    } catch {
      // Keep the status-based message below.
    }
    throw new ReviewApiError(res.status, detail || `request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchReviewQueue(source: 'catalog' | 'creator' | 'all' = 'all'): Promise<ReviewQueueResponse> {
  const res = await fetch(`${API_BASE}/api/review/queue?source=${encodeURIComponent(source)}`, {
    credentials: 'include',
  });
  return readJson(res);
}

export interface ReviewStatusResponse {
  remaining: number;
  sweep: ReviewQueueSweepHint | null;
}

export async function fetchReviewStatus(): Promise<ReviewStatusResponse | null> {
  const res = await fetch(`${API_BASE}/api/review/status`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new ReviewApiError(res.status, `review status failed (${res.status})`);
  return (await res.json()) as ReviewStatusResponse;
}

export async function submitAssessment(input: SubmitAssessmentInput): Promise<GameAssessment> {
  const res = await fetch(`${API_BASE}/api/review/assessments`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJson<{ assessment: GameAssessment }>(res);
  return body.assessment;
}

export async function fetchMyAssessments(): Promise<GameAssessment[]> {
  const res = await fetch(`${API_BASE}/api/review/assessments/mine`, { credentials: 'include' });
  const body = await readJson<{ assessments: GameAssessment[] }>(res);
  return body.assessments;
}

export type { AssessmentResolutionStatus, ReReviewRequestStatus };

export interface ResolveAssessmentInput {
  slug: string;
  // Omitted resolves every reviewer's row for the slug.
  reviewerUid?: string;
  // Null withdraws a resolution recorded by mistake.
  status: AssessmentResolutionStatus | null;
  comment?: string;
  link?: string | null;
  // Verdict generation this resolution answers; a newer row is refused.
  expectedUpdatedAt?: string;
}

// Records the operator follow-up on one verdict or game.
export async function resolveAssessment(
  input: ResolveAssessmentInput,
): Promise<{ assessments: GameAssessment[]; resolved: boolean; stale: string[] }> {
  const res = await fetch(`${API_BASE}/api/admin/assessments/resolve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export interface ReReviewRequest {
  id: string;
  slug: string;
  reviewerUid: string;
  status: ReReviewRequestStatus;
  gameVersion: string | null;
  reason: string | null;
  createdAt: string;
  createdBy: string;
  resolvedAt: string | null;
}

export interface RequeueForReReviewInput {
  slugs: string[];
  reviewerUids: string[];
  gameVersion?: string | null;
  reason?: string | null;
  notify?: boolean;
}

// Explicit slugs x explicit reviewers, outside any sweep.
export async function requeueForReReview(
  input: RequeueForReReviewInput,
): Promise<{ requests: ReReviewRequest[]; notified: number }> {
  const res = await fetch(`${API_BASE}/api/admin/review-requeue`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readJson(res);
}

export async function fetchReReviewRequests(): Promise<{ requests: ReReviewRequest[] }> {
  const res = await fetch(`${API_BASE}/api/admin/review-requeue`, { credentials: 'include' });
  return readJson(res);
}

export interface AssessmentHistoryResponse {
  current: GameAssessment | null;
  history: GameAssessment[];
}

// The rows a plain re-edit would otherwise have overwritten silently.
export async function fetchAssessmentHistory(slug: string, reviewerUid: string): Promise<AssessmentHistoryResponse> {
  const params = new URLSearchParams({ slug, reviewerUid });
  const res = await fetch(`${API_BASE}/api/admin/assessments/history?${params.toString()}`, {
    credentials: 'include',
  });
  return readJson(res);
}
