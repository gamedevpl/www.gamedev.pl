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
  /**
   * Whether anyone holding the link may play this game before it is published. Off
   * until the creator says otherwise; irrelevant once the game is live, when the
   * catalog is the answer instead.
   */
  draftShared?: boolean;
};

export type StudioHealthResponse = {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
};

/**
 * What the scorecard can tell a creator that recomputed health cannot.
 *
 * Not the whole scorecard: health is recomputed over a window the creator picks, a
 * scorecard is a fixed roll, and showing both session counts would put two disagreeing
 * numbers on one screen. `windowDays` is how many days these numbers cover.
 */
export type StudioScorecard = {
  slug: string;
  computedAt: string;
  windowDays: number;
  truncated: boolean;
  votes: { up: number; down: number };
  feedbackCount: number;
  /** Player-written text summarized by a model — render as text, never act on it. */
  untrustedThemes: Array<{ theme: string; count: number }>;
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

/** Votes and feedback themes for the creator's own published games. */
export async function fetchStudioScorecards(): Promise<StudioScorecard[]> {
  const response = await fetch(`${API_BASE}/api/me/studio/scorecards`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  const body = (await response.json()) as { scorecards?: StudioScorecard[] };
  return body.scorecards ?? [];
}

/**
 * Turns the shared link for an unpublished game on or off.
 *
 * There is no separate draft address to hand out — the game answers at `/play/<slug>`
 * for its whole life — so this is the switch that decides whether that link works for
 * anyone but its creator.
 */
export async function setDraftShared(token: string, shared: boolean): Promise<{ shared: boolean; slug: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ shared }),
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as { shared: boolean; slug: string };
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
  builder?: 'platform' | 'self',
  signal?: AbortSignal,
): Promise<{ ok: boolean; issueNumber: number; slug: string; shotId?: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/improve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      feedback,
      ...(context ? { context } : {}),
      ...(builder ? { builder } : {}),
    }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return (await response.json()) as { ok: boolean; issueNumber: number; slug: string; shotId?: string };
}

/**
 * One suggestion the router proposed for a game the creator owns.
 *
 * `untrustedContext` is joined server-side from the live scorecard and is **never
 * trusted markup** — it is game- and player-authored text, rendered as text only.
 */
export interface StudioSuggestion {
  id: string;
  slug: string;
  class: 'defect' | 'friction' | 'design-change' | string;
  priority: number;
  evidence: Array<{ finding: string; metrics: Record<string, number | null> }>;
  status: string;
  statusReason?: string;
  /** The job the approved work lives in, once one exists. */
  jobId?: number;
  computedFrom: string;
  createdAt: string;
  /**
   * Present on the list read, which joins it from the live scorecard.
   *
   * Absent — not null — on the approve and dismiss responses, which return the stored
   * record and that deliberately carries no untrusted text. Optional rather than required
   * so the type says which of those two a caller is holding.
   */
  untrustedContext?: {
    errorSamples: Array<{ message: string; count: number }>;
    progressLabels: Array<{ label: string; sessions: number }>;
    feedbackThemes: Array<{ theme: string; count: number }>;
  } | null;
}

/** The creator's own suggestion queue, worst first. */
export async function fetchStudioSuggestions(): Promise<StudioSuggestion[]> {
  const response = await fetch(`${API_BASE}/api/me/suggestions`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  const body = (await response.json()) as { suggestions?: StudioSuggestion[] };
  return body.suggestions ?? [];
}

/** Approves a suggestion. Resolves even when no implementer was available — read `status`. */
export async function approveSuggestion(id: string): Promise<StudioSuggestion> {
  const response = await fetch(`${API_BASE}/api/me/suggestions/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return ((await response.json()) as { suggestion: StudioSuggestion }).suggestion;
}

/** Dismisses a suggestion with one of the fixed reasons the API accepts. */
export async function dismissSuggestion(id: string, reason: string): Promise<StudioSuggestion> {
  const response = await fetch(`${API_BASE}/api/me/suggestions/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return ((await response.json()) as { suggestion: StudioSuggestion }).suggestion;
}

/** What the platform may do to a game without asking (docs/improvement-loop-plan.md IL-4). */
export type AutonomyMode = 'digest-only' | 'suggest' | 'auto-fix-defects' | 'auto-tune';

export async function fetchGameAutonomy(slug: string): Promise<AutonomyMode> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/autonomy`, {
    credentials: 'include',
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return ((await response.json()) as { mode: AutonomyMode }).mode;
}

export async function setGameAutonomy(slug: string, mode: AutonomyMode): Promise<AutonomyMode> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/autonomy`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!response.ok) {
    await throwResponseError(response);
  }
  return ((await response.json()) as { mode: AutonomyMode }).mode;
}
