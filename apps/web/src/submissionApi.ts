import type {
  BuildEventKind,
  BuilderKind,
  BuildMediaItem,
  BuildPlayableItem,
  BuildStep,
  GateProgressLane,
  JobStall,
  JobState,
  MySubmission,
  MySubmissionsPage,
  PlatformBuilderAvailability,
  SubmissionState,
  SubmissionStatusResponse,
} from '@gamedevpl/contract';
import { fetchCached, invalidateCachedPrefix } from './core/dataLayer.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type { BuildEventKind, BuildStep, GateProgressLane, JobStall, JobState, SubmissionState };
export type {
  BuildEvent,
  BuildMediaItem,
  BuildPlayableItem,
  BuildProgress,
  MySubmission,
  MySubmissionsPage,
  PlatformBuilderAvailability,
  PriorRoundEntry,
  PriorRoundHistory,
  RecentBuild,
} from '@gamedevpl/contract';

// The whole GET /api/submissions/:token body, under the name the web has always used.
export type SubmissionStatus = SubmissionStatusResponse;

/**
 * Fetch one channel-pushed playable build as HTML text.
 *
 * The document is unreviewed agent output. Execution stays sandboxed: the app hands
 * it to GameTheater as srcdoc (`sandbox="allow-scripts"`, no `allow-same-origin`) and
 * injects the player bridge — the same path as a PR draft. Fetching into the parent
 * as a string is required for that bridge; it is not the same as inlining the markup
 * into the app DOM.
 */
export async function getChannelPlayable(token: string, item: BuildPlayableItem): Promise<string> {
  const response = await fetch(buildPlayableUrl(token, item), { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return response.text();
}

/**
 * Where to fetch one playable build. Prefer {@link getChannelPlayable} when the app
 * will open it in the theater (needs the HTML string to inject the player bridge).
 */
export function buildPlayableUrl(token: string, item: BuildPlayableItem): string {
  return `${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview/${encodeURIComponent(item.ref)}`;
}

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
  /** Who builds this round — platform team (default) or the creator's own agent. */
  builder?: BuilderKind;
  // Base64 PNGs, no data: prefix. Max 4.
  referenceImages?: string[];
}): Promise<{ token: string; slug?: string; statusUrl: string }> {
  const response = await fetch(`${API_BASE}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  // `slug` is the game's address, minted server-side from the confirmed title. Optional
  // only because an older API deploy answers without one.
  return (await response.json()) as { token: string; slug?: string; statusUrl: string };
}

function submissionStatusCacheKeyPrefix(token: string): string {
  return `submission-status:${token}:`;
}

/**
 * Drops the cached status (every locale) for `token`, so the next
 * {@link getSubmissionStatus} call always issues a fresh request rather
 * than joining or reusing one that predates a mutation on this token.
 */
function invalidateSubmissionStatus(token: string): void {
  invalidateCachedPrefix(submissionStatusCacheKeyPrefix(token));
}

/**
 * `locale` localizes the agent's build log (its commit subjects and checklist are
 * written in English) — without it a Polish creator watches an English wall of text.
 */
export async function getSubmissionStatus(token: string, locale?: string): Promise<SubmissionStatus> {
  // The 5 Studio surfaces that poll this endpoint on independent timers often
  // land within the same tick of each other; fetchCached's dedup (default
  // ttlMs: 0) collapses those into one request without changing freshness
  // for a caller that lands outside that window — see core/dataLayer.ts.
  return fetchCached(`${submissionStatusCacheKeyPrefix(token)}${locale ?? ''}`, async () => {
    const query = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}${query}`);

    if (!response.ok) {
      await throwResponseError(response);
    }

    return (await response.json()) as SubmissionStatus;
  });
}

export async function listMySubmissionsPage(): Promise<MySubmissionsPage> {
  const response = await fetch(`${API_BASE}/api/submissions/mine`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  const body = (await response.json()) as {
    submissions?: MySubmission[];
    truncated?: boolean;
    totalGames?: number;
  };
  const submissions = body.submissions ?? [];
  return {
    submissions,
    truncated: body.truncated ?? false,
    totalGames: body.totalGames ?? submissions.length,
  };
}

export async function listMySubmissions(): Promise<MySubmission[]> {
  const page = await listMySubmissionsPage();
  return page.submissions;
}

// The header badge's number, counted server-side.
export async function fetchActiveBuildCount(): Promise<number> {
  const response = await fetch(`${API_BASE}/api/submissions/mine/active-count`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return ((await response.json()) as { active?: number }).active ?? 0;
}

export async function getSubmissionPreview(token: string, version?: string): Promise<SubmissionPreview> {
  const query = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview${query}`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as SubmissionPreview;
}

export interface RevertGameVersionResult {
  accepted: boolean;
  version?: string;
  roundOpened?: number;
  token?: string;
}

export async function revertGameVersion(slug: string, targetVersion: string): Promise<RevertGameVersionResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ targetVersion, attestation: true }),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as RevertGameVersionResult;
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
  invalidateSubmissionStatus(token);
}

export async function deleteGame(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/delete-game`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
  invalidateSubmissionStatus(token);
}

export type BuilderHandoffResponse = { pending?: boolean; acknowledgedAt?: string };

export async function handoffToPlatform(
  token: string,
  options: { stopActiveSelfAgent?: boolean } = {},
): Promise<BuilderHandoffResponse> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/handoff`, {
    method: 'POST',
    credentials: 'include',
    ...(options.stopActiveSelfAgent
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(options) }
      : {}),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
  invalidateSubmissionStatus(token);
  return (await response.json()) as BuilderHandoffResponse;
}

export async function handoffToSelf(token: string): Promise<BuilderHandoffResponse> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/handoff`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ builder: 'self', stopActivePlatformAgent: true }),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
  invalidateSubmissionStatus(token);
  return (await response.json()) as BuilderHandoffResponse;
}

/** Promotes a green preview to a publish candidate; the full gate then judges it. */
export async function sealPreview(token: string): Promise<{ version: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/seal`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
  invalidateSubmissionStatus(token);
  return (await response.json()) as { version: string };
}

/** Today's submission allowance, so a creator sees it before they hit a 429. */
export async function getQuota(): Promise<{
  submissions: { used: number; limit: number | null };
  platformBuilder?: PlatformBuilderAvailability;
}> {
  const response = await fetch(`${API_BASE}/api/me/quota`, { credentials: 'include' });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as {
    submissions: { used: number; limit: number | null };
    platformBuilder?: PlatformBuilderAvailability;
  };
}

/**
 * Relays post-play "here's what to change" feedback to the build agent. The API
 * posts it as a comment on the agent's open PR (or the issue) so it iterates.
 * Optional playtest context (paused-frame PNG + instrumentation) rides along as
 * fenced data — see Creator Studio's Playtest tab.
 */
export type FeedbackContext = {
  screenshotPng?: string;
  instrumentation?: {
    playSeconds?: number;
    lastAliveFrames?: number | null;
    errors?: string[];
    progress?: string[];
  };
  // Base64 PNGs, no data: prefix. Max 4.
  referenceImages?: string[];
};

/**
 * The message was kept, but no build round started behind it.
 *
 * Present only in that case — absent means a round is running, which is the answer this
 * call gives almost every time. `no_capacity` says the coding-agent account is out of
 * premium requests: nothing about this game is wrong and pressing send again changes
 * nothing, which is a different sentence from "that didn't work".
 */
export type FeedbackResult = {
  ok: boolean;
  target: string;
  shotId?: string;
  roundStarted?: false;
  reason?: 'not_configured' | 'no_capacity' | 'dispatch_failed';
};

export async function submitFeedback(
  token: string,
  feedback: string,
  context?: FeedbackContext,
  builder?: BuilderKind,
): Promise<FeedbackResult> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      feedback,
      ...(context ? { context } : {}),
      ...(builder ? { builder } : {}),
    }),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
  invalidateSubmissionStatus(token);

  return (await response.json()) as FeedbackResult;
}

/** What the pre-submission refiner has to say about a concept. */
export type RefinedSpec = {
  questions: Array<{
    id: string;
    question: string;
    options: Array<{ label: string; detail?: string }>;
    allowFreeText?: boolean;
    multiple?: boolean;
  }>;
  /**
   * A name for the game, proposed from the concept. The creator confirms or replaces
   * it before anything is built; absent when the model had nothing usable to offer,
   * which is the caller's cue to fall back to a name derived from the prompt.
   */
  suggestedTitle?: string;
};

/**
 * Asks the refiner to read a concept: name it, and say what it still needs to know.
 *
 * `title` is optional and normally omitted — the creator has not been asked for one at
 * this point in the flow, which is the whole reason `suggestedTitle` comes back.
 */
export async function refineSpec(input: { title?: string; concept: string; locale?: string }): Promise<RefinedSpec> {
  const response = await fetch(`${API_BASE}/api/submissions/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  return (await response.json()) as RefinedSpec;
}
