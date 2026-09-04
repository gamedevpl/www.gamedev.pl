import type {
  BuilderKind,
  BuildEventKind,
  BuildStep,
  GateProgressLane,
  JobStall,
  JobState,
  SubmissionState,
} from '@gamedevpl/contract';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type { BuildEventKind, BuildStep, GateProgressLane, JobStall, JobState, SubmissionState };

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
   * The creator's own change requests on this build, oldest→newest — read back off
   * the PR conversation or the store, whichever this build uses, so the page can
   * show a creator what they already asked for. Optional: an older API deploy
   * doesn't send it.
   */
  revisions?: Array<{
    text: string;
    createdAt: string;
    // 'agent': relayed by the agent. 'studio': the chat agent. Else: the creator.
    origin?: 'agent' | 'studio';
    delivered?: boolean;
  }>;
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
  /** Set when the game has published — optional on older API responses. */
  publishedAt?: string;
  /**
   * Catalog publish time when this row is an improvement tip — the game is still live
   * but the open job has no `publishedAt` of its own.
   */
  livePublishedAt?: string;
};

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
  /**
   * The build job's own state, finer than {@link SubmissionState}.
   *
   * `status` drives the five-step timeline and cannot grow without changing what the
   * timeline draws; this says which of the several situations behind one step the build
   * is actually in, so the sentence under the timeline can be true. Absent on builds we
   * derive from GitHub rather than run ourselves.
   */
  phase?: JobState;
  slug?: string;
  /**
   * `'remix'` when this Studio draft was saved from an in-player remix (private
   * preview-lane fork). Used so Final-check / "going live" copy is not shown for
   * a remix that never ran the gate and never publishes by itself.
   */
  draftOrigin?: 'remix';
  /** Present while an unmerged PR is open: the game can be previewed from its branch. */
  preview?: { slug: string };
  /** Present while an unmerged PR is open: live build signals mined from the PR. */
  progress?: BuildProgress;
  previewGate?: { green: boolean; ranAt: string; report?: string; status?: 'kit_outdated' };
  /**
   * Agent updates from the build channel, newest first. Deliberately independent of
   * `progress`: these start arriving before a PR exists, which is precisely the
   * stretch where the page used to have nothing at all to show.
   */
  events?: BuildEvent[];
  // Last agent activity; advances even with no new chat event.
  lastAgentSignalAt?: string;
  // Ambient presence thought — flashed, never a transcript row.
  lastAgentPresence?: { key: string; at: string };
  /** Mid-gate milestone while checks run. */
  gateProgress?: {
    lane: GateProgressLane;
    stage: string;
    index: number;
    total: number;
    at: string;
  };
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
  /**
   * Why the build looks stuck, when it does. Closed vocabulary; the page renders its
   * own translated copy per value. Absent means progressing normally.
   */
  stall?: JobStall;
  /**
   * When the self agent called MCP `end`. Survives when stall later becomes
   * `gate_not_started` — Studio still offers platform handoff.
   */
  agentEndedAt?: string;
  /**
   * Who is building the current round, when the API reports it. Optional — older
   * deploys omit it; the Studio then falls back to local last-used memory.
   */
  builder?: BuilderKind;
  /** Last builder used on this game (default for the next round), when reported. */
  defaultBuilder?: BuilderKind;
  builderHandoff?: {
    target: BuilderKind;
    requestedAt: string;
    acknowledgedAt?: string;
  };
  // Whether platform can be picked or handed off to right now.
  platformBuilder?: PlatformBuilderAvailability;
  /**
   * Why this build is asking the creator to act. Covers a dead agent round
   * (`task_failed`, …) and a gate bounce (`gate_red`) — both arrive as public
   * `needs_changes`. Render translated copy keyed on `reason`, never the string
   * itself. Sending feedback starts a new round.
   */
  failure?: { reason: string };
  /** Who opened this improvement round, when reported (BY-24). */
  openedBy?: 'creator' | 'agent';
  /**
   * Older jobs on the same game (same slug), oldest first — collapsed history so a
   * new improve round does not make prior Studio chat look deleted. Optional: older
   * API deploys omit it.
   */
  priorRounds?: PriorRoundHistory[];
  /** Read-only capability probe for the Code surface (CE-05). Absent before a bound slug. */
  codeSurface?: { available: boolean; readOnly: boolean; reason?: 'agent_round' | 'killed' };
  // Last few delivered versions, newest first — what shipped, not the live round.
  recentBuilds?: RecentBuild[];
};

// Summarizes one delivered version for `SubmissionStatus.recentBuilds`.
export type RecentBuild = {
  version: string;
  createdAt: string;
  mode: 'preview' | 'publish' | 'proposal';
  // 'pending' until this version's own gate reports a verdict.
  verdict: 'pending' | 'green' | 'red';
  status?: 'kit_outdated';
  // Where a red run died, so the bar freezes there rather than guessing.
  failedStage?: string;
  failedIndex?: number;
  total?: number;
  // Delivery to verdict, in ms; the bar's ETA median uses these.
  finishedInMs?: number;
};

/** One superseded build job's transcript, for the collapsed history blocks. */
export type PriorRoundHistory = {
  id: string;
  createdAt: string;
  publishedAt?: string;
  status: SubmissionState;
  entries: PriorRoundEntry[];
};

export type PriorRoundEntry = {
  kind: 'revision' | 'event';
  /** Untrusted text — render escaped. */
  text: string;
  createdAt: string;
  origin?: 'agent' | 'studio';
  step?: BuildStep;
};

export type BuildPlayableItem = {
  ref: string;
  slug?: string;
  /** Untrusted, agent-authored text — render escaped. */
  label?: string;
  createdAt?: string;
};

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

// Layer-2 idea chips (NP-1) — server-generated, bilingual, prefill-only.
export type NextIdea = {
  id: string;
  label: { en: string; pl: string };
  prompt: { en: string; pl: string };
};

export async function getNextIdeas(token: string, options: { regenerate?: boolean } = {}): Promise<NextIdea[]> {
  const query = options.regenerate ? '?regenerate=1' : '';
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/next-ideas${query}`);

  if (!response.ok) {
    await throwResponseError(response);
  }

  const body = (await response.json()) as { ideas?: NextIdea[] };
  return body.ideas ?? [];
}

/**
 * The signed-in creator's own games. Server-side ownership means this works on a
 * device that never saved the tracking link — the tokens come back with it.
 */
export type MySubmissionsPage = {
  submissions: MySubmission[];
  truncated: boolean;
  totalGames: number;
};

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

export async function getSubmissionPreview(token: string): Promise<SubmissionPreview> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/preview`);

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

export async function deleteGame(token: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/delete-game`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    await throwResponseError(response);
  }
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
  return (await response.json()) as BuilderHandoffResponse;
}

export type PlatformBuilderAvailability =
  { available: true } | { available: false; reason: 'coming_soon' | 'outage' | 'global_limit' | 'user_limit' };

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
