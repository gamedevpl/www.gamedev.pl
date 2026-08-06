import type { AssessmentNoteOrigin, AssessmentSource, AssessmentVerdict } from './reviewTypes.js';

const API_BASE = '';

export interface ReviewQueueItem {
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  genre: string | null;
  issueNumber: number | null;
}

export interface ReviewQueueResponse {
  source: 'catalog' | 'creator' | 'all';
  remaining: number;
  assessed: number;
  items: ReviewQueueItem[];
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
  createdAt: string;
  updatedAt: string;
}

export interface SubmitAssessmentInput {
  slug: string;
  source: AssessmentSource;
  title?: string;
  creatorHandle?: string | null;
  verdict: AssessmentVerdict;
  note?: string;
  noteOrigin?: AssessmentNoteOrigin;
}

export interface AdminAssessmentsResponse {
  total: number;
  games: Array<{
    slug: string;
    title: string;
    keep: number;
    cut: number;
    skip: number;
    notes: number;
  }>;
  recent: GameAssessment[];
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body.error ?? '';
    } catch {
      // Keep the status-based message below.
    }
    throw new Error(detail || `request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchReviewQueue(source: 'catalog' | 'creator' | 'all' = 'all'): Promise<ReviewQueueResponse> {
  const res = await fetch(`${API_BASE}/api/review/queue?source=${encodeURIComponent(source)}`, {
    credentials: 'include',
  });
  return readJson(res);
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

export async function fetchAdminAssessments(): Promise<AdminAssessmentsResponse> {
  const res = await fetch(`${API_BASE}/api/admin/assessments`, { credentials: 'include' });
  return readJson(res);
}
