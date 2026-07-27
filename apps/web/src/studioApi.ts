import type { GameHealth } from './healthApi.js';
import type { FeedbackContext, SubmissionState } from './submissionApi.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type StudioGame = {
  token: string;
  title: string;
  createdAt: string;
  lastKnownStatus: SubmissionState | null;
  slug?: string;
  publishedAt?: string;
};

export type StudioHealthResponse = {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
};

export type StudioApiError = Error & { status?: number; category?: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function throwResponseError(response: Response): Promise<never> {
  const body = (await readJson(response)) as { error?: string; category?: string } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as StudioApiError;
  error.status = response.status;
  error.category = body?.category;
  throw error;
}

/** The signed-in creator's control-panel shelf (slug + publish time when known). */
export async function fetchStudioGames(): Promise<StudioGame[]> {
  const response = await fetch(`${API_BASE}/api/me/studio`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  const body = (await response.json()) as { games?: StudioGame[] };
  return body.games ?? [];
}

/** Play-health aggregates for the creator's own published slugs only. */
export async function fetchStudioHealth(days: number): Promise<StudioHealthResponse> {
  const response = await fetch(`${API_BASE}/api/me/studio/health?days=${days}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as StudioHealthResponse;
}

/**
 * Files a post-publish improvement issue. Draft revisions still use
 * {@link submitFeedback} on the open PR. Optional playtest context attaches a
 * paused-frame screenshot + instrumentation digest (Creator Studio Playtest).
 */
export async function submitImprovement(
  token: string,
  feedback: string,
  context?: FeedbackContext,
): Promise<{ ok: boolean; issueNumber: number; slug: string; shotId?: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/improve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ feedback, ...(context ? { context } : {}) }),
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as { ok: boolean; issueNumber: number; slug: string; shotId?: string };
}
