const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type SubmissionState = 'queued' | 'building' | 'in_review' | 'publishing' | 'published' | 'needs_changes';

export type BuildProgress = {
  /** Head commit SHA of the PR — changes when the agent pushes new work. */
  headSha: string;
  /** Running build log — recent commit subject lines, oldest→newest. Untrusted text. */
  commits: Array<{ message: string; committedDate: string }>;
  /** The agent's task checklist parsed from the PR body. Untrusted text. */
  checklist: Array<{ text: string; checked: boolean }>;
};

export type SubmissionStatus = {
  status: SubmissionState;
  slug?: string;
  /** Present while an unmerged PR is open: the game can be previewed from its branch. */
  preview?: { slug: string };
  /** Present while an unmerged PR is open: live build signals mined from the PR. */
  progress?: BuildProgress;
};

export type SubmissionPreview = {
  slug: string;
  title: string;
  html: string;
};

export type SubmissionApiError = Error & { status?: number; category?: string };

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function throwResponseError(response: Response): Promise<never> {
  const body = (await readJson(response)) as { error?: string; category?: string } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as SubmissionApiError;
  error.status = response.status;
  error.category = body?.category;
  throw error;
}

export async function submitSpec(input: {
  title: string;
  concept: string;
  displayName?: string;
}): Promise<{ token: string; statusUrl: string }> {
  const response = await fetch(`${API_BASE}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as { token: string; statusUrl: string };
}

export async function getSubmissionStatus(token: string): Promise<SubmissionStatus> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionStatus;
}

export async function getSubmissionPreview(token: string): Promise<SubmissionPreview> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionPreview;
}

/**
 * Relays post-play "here's what to change" feedback to the build agent. The API
 * posts it as a comment on the agent's open PR (or the issue) so it iterates.
 */
export async function submitFeedback(token: string, feedback: string): Promise<{ ok: boolean; target: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback }),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as { ok: boolean; target: string };
}

export async function refineSpec(input: { title: string; concept: string; locale?: string }): Promise<{
  questions: Array<{
    id: string;
    question: string;
    options: Array<{ label: string; detail?: string }>;
    allowFreeText?: boolean;
  }>;
}> {
  const response = await fetch(`${API_BASE}/api/submissions/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as {
    questions: Array<{
      id: string;
      question: string;
      options: Array<{ label: string; detail?: string }>;
      allowFreeText?: boolean;
    }>;
  };
}
