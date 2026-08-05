/**
 * Review client — the two halves of the side-by-side comparison.
 *
 * Credentialed throughout: a delivered candidate is unreviewed output, visible to the
 * game's owner and to an operator and to nobody else.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface ReviewFileStat {
  path: string;
  status: 'added' | 'removed' | 'modified';
  added: number | null;
  removed: number | null;
}

export interface ReviewDiff {
  files: ReviewFileStat[];
  filesChanged: number;
  added: number;
  removed: number;
  truncated: boolean;
}

export interface ReviewCandidate {
  version: string;
  createdAt: string;
  jobId: number;
  title: string;
  gate: { green: boolean; ranAt: string; report?: string } | null;
  approvedAt?: string;
}

export interface GameReview {
  baselineVersion: string | null;
  candidate: ReviewCandidate | null;
  diff: ReviewDiff | null;
  viewerIsOperator: boolean;
  /** Owners sign off; an operator looking at somebody else's game may not. */
  canSignOff: boolean;
}

/** Thrown shape shared by the review reads, so the component can branch on access. */
export type ReviewErrorCode = 'unauthorized' | 'forbidden' | 'unknown';

export async function fetchGameReview(slug: string): Promise<GameReview> {
  const response = await fetch(`${API_BASE}/api/games/${encodeURIComponent(slug)}/review`, {
    credentials: 'include',
  });
  if (!response.ok) throw reviewError(response.status);
  return (await response.json()) as GameReview;
}

/** The candidate document — same shape as the published-game read, for the same frame. */
export async function fetchReviewCandidate(
  slug: string,
  version: string,
): Promise<{ slug: string; title: string; html: string }> {
  const response = await fetch(
    `${API_BASE}/api/games/${encodeURIComponent(slug)}/review/${encodeURIComponent(version)}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw reviewError(response.status);
  return (await response.json()) as { slug: string; title: string; html: string };
}

export async function approveCandidate(slug: string, version: string): Promise<{ approvedAt: string }> {
  const response = await fetch(
    `${API_BASE}/api/games/${encodeURIComponent(slug)}/review/${encodeURIComponent(version)}/approve`,
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) {
    let code = 'unknown';
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error.trim()) code = body.error;
    } catch {
      // keep the status-derived code
    }
    throw Object.assign(new Error(code), { code });
  }
  return (await response.json()) as { approvedAt: string };
}

function reviewError(status: number): Error & { code: ReviewErrorCode } {
  const code: ReviewErrorCode = status === 401 ? 'unauthorized' : status === 404 ? 'forbidden' : 'unknown';
  return Object.assign(new Error(code), { code });
}
