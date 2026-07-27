const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type SubmissionState =
  | 'queued'
  | 'building'
  | 'in_review'
  | 'publishing'
  | 'published'
  | 'needs_changes'
  /** Creator-chosen terminal state: they stopped the build. */
  | 'abandoned';

export type BuildProgress = {
  /** Head commit SHA of the PR — changes when the agent pushes new work. */
  headSha: string;
  /** Running build log — recent commit subject lines, oldest→newest. Untrusted text. */
  commits: Array<{ message: string; committedDate: string }>;
  /** The agent's task checklist parsed from the PR body. Untrusted text. */
  checklist: Array<{ text: string; checked: boolean }>;
  /** CI rollup on the head commit — 'FAILURE' means in trouble, not just slow. */
  checks?: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
  /**
   * The agent's own one-line "what I'm doing right now", written to its branch and
   * localized by the API. Present only when the agent keeps that journal.
   */
  note?: string;
  /**
   * The creator's own change requests on this build, oldest→newest. Read back off
   * the PR so the status page can show a creator what they already asked for.
   * Optional: an older API deploy doesn't send it.
   */
  revisions?: Array<{ text: string; createdAt: string }>;
};

/** One of the creator's games, as listed by GET /api/submissions/mine. */
export type MySubmission = {
  token: string;
  title: string;
  createdAt: string;
  /** Last status derived server-side, refreshed by the two-minute sweep. */
  lastKnownStatus: SubmissionState | null;
  /** Present once known, so a published card can link straight to the game. */
  slug: string | null;
};

/** The build steps an agent can report. Rendered from our own translated copy. */
export type BuildStep = 'planning' | 'art' | 'mechanics' | 'audio' | 'balancing' | 'fixing' | 'testing' | 'polishing';

export type BuildEventKind = 'step' | 'milestone' | 'asking' | 'blocked' | 'done';

/**
 * An update the agent pushed over the build channel. Unlike a commit subject, this
 * is the agent saying what it is doing *now*, and it arrives without waiting for a
 * push. `text` is already resolved to the reader's language by the API.
 */
export type BuildEvent = {
  id: string;
  kind: BuildEventKind;
  step?: BuildStep;
  /** Untrusted, agent-authored text — render escaped. */
  text: string;
  progress?: { done: number; total: number };
  createdAt: string;
};

export type SubmissionStatus = {
  status: SubmissionState;
  slug?: string;
  /** Present while an unmerged PR is open: the game can be previewed from its branch. */
  preview?: { slug: string };
  /** Present while an unmerged PR is open: live build signals mined from the PR. */
  progress?: BuildProgress;
  /**
   * Agent updates from the build channel, newest first. Deliberately independent of
   * `progress`: these start arriving before a PR exists, which is precisely the
   * stretch where the page used to have nothing at all to show.
   */
  events?: BuildEvent[];
  /**
   * Pictures of the build, newest first. `branch` items are captures the agent
   * committed; `channel` items were pushed straight to the API and can appear long
   * before the first commit. Build the URL with {@link buildMediaUrl}.
   */
  media?: BuildMediaItem[];
  /**
   * Playable builds pushed over the channel, newest first — the game as it stood at
   * some moment, before any commit. Build the URL with {@link buildPlayableUrl}.
   */
  playable?: BuildPlayableItem[];
};

export type BuildPlayableItem = {
  ref: string;
  slug?: string;
  /** Untrusted, agent-authored text — render escaped. */
  label?: string;
  createdAt?: string;
};

/**
 * Where to fetch one playable build. The response is unreviewed agent output served as
 * HTML, so it is only ever loaded into a sandboxed frame — never fetched and inlined.
 */
export function buildPlayableUrl(token: string, item: BuildPlayableItem): string {
  return `${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview/${encodeURIComponent(item.ref)}`;
}

export type BuildMediaItem = {
  source: 'branch' | 'channel';
  ref: string;
  /** Untrusted, agent-authored text — render escaped. */
  label?: string;
  createdAt?: string;
};

/**
 * Where to fetch one of a build's pictures. The two sources are served by different
 * routes — one reads the agent's branch, the other our own store — but the caller
 * only ever has an item, so the choice lives here rather than at every `<img>`.
 */
export function buildMediaUrl(token: string, item: BuildMediaItem): string {
  const path = item.source === 'branch' ? 'media' : 'shot';
  return `${API_BASE}/api/submissions/${encodeURIComponent(token)}/${path}/${encodeURIComponent(item.ref)}`;
}

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
  /** Told to the agent, so it writes its progress updates in this language. */
  locale?: string;
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

/**
 * `locale` localizes the agent's build log (its commit subjects and checklist are
 * written in English) — without it a Polish creator watches an English wall of text.
 */
export async function getSubmissionStatus(token: string, locale?: string): Promise<SubmissionStatus> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : '';
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}${query}`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionStatus;
}

/**
 * The signed-in creator's own games. Server-side ownership means this works on a
 * device that never saved the tracking link — the tokens come back with it.
 */
export async function listMySubmissions(): Promise<MySubmission[]> {
  const response = await fetch(`${API_BASE}/api/submissions/mine`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  const body = (await response.json()) as { submissions?: MySubmission[] };
  return body.submissions ?? [];
}

export async function getSubmissionPreview(token: string): Promise<SubmissionPreview> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionPreview;
}

/**
 * How long recent builds actually took. Used to turn "your game is in the queue"
 * into an expectation the creator can plan around. Null median = not enough data
 * yet; the UI falls back to a range.
 */
export async function getBuildStats(): Promise<{ medianMinutes: number | null; sampleSize: number }> {
  const response = await fetch(`${API_BASE}/api/submissions/stats`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as { medianMinutes: number | null; sampleSize: number };
}

/**
 * The read-only, shareable form of a draft: addressed by slug like a published game,
 * with no status token involved — so a shared link can't send change requests.
 */
export async function getDraftBySlug(slug: string): Promise<SubmissionPreview> {
  const response = await fetch(`${API_BASE}/api/drafts/${encodeURIComponent(slug)}`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionPreview;
}

/**
 * Stops a build for good: the API closes the issue and the agent's open PR. The
 * daily quota is not refunded — the agent time was already spent.
 */
export async function abandonSubmission(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/abandon`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
}

/** Today's submission allowance, so a creator sees it before they hit a 429. */
export async function getQuota(): Promise<{ submissions: { used: number; limit: number | null } }> {
  const response = await fetch(`${API_BASE}/api/me/quota`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as { submissions: { used: number; limit: number | null } };
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
    multiple?: boolean;
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
      multiple?: boolean;
    }>;
  };
}
