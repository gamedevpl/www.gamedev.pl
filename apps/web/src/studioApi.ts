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
   * Catalog publish time when this row is an improvement tip — the game is still live
   * but the open job has no `publishedAt` of its own.
   */
  livePublishedAt?: string;
  /**
   * Whether anyone holding the link may play this game before it is published. Off
   * until the creator says otherwise; irrelevant once the game is live, when the
   * catalog is the answer instead.
   */
  draftShared?: boolean;
  /**
   * Whether this game's delivered version ships an editor definition. Gates the
   * Edit surface; absent for every game that is not born-editable, and the
   * studio must render exactly as before for those.
   */
  editable?: boolean;
};

/* ---------------------------------------------------------------------------
 * Content editor (EditorKit) — the studio's Edit surface.
 * The definition is the game's own EDITOR.json (agent-authored, gate-validated);
 * the studio renders it with the fixed widget vocabulary and never invents
 * structure the definition does not declare.
 * ------------------------------------------------------------------------- */

export type EditorLabel = { en: string; pl: string };

export type EditorPropertySpec =
  | { type: 'text'; max: number }
  | { type: 'int'; min: number; max: number }
  | { type: 'number'; min: number; max: number }
  | { type: 'enum'; values: string[] }
  | { type: 'bool' };

export type EditorConstraint =
  | { tile: string; min?: number; max?: number; exactly?: number }
  | { equalCounts: [string, string] }
  /** Every `require` tile must be reachable from `from` without crossing `blockedBy`. */
  | { reachable: { from: string; blockedBy: string[]; require: string[] } };

export type EditorTileSpec = {
  key: string;
  char: string;
  label: EditorLabel;
  /** `#rrggbb` the game declared for this tile, so the painter matches the played game. */
  color?: string;
};

export type EditorTilemapSpec = {
  widget: 'tilemap';
  grid: { minCols: number; maxCols: number; minRows: number; maxRows: number };
  tiles: EditorTileSpec[];
  properties: Record<string, EditorPropertySpec>;
  constraints: EditorConstraint[];
};

export type EditorCollectionSpec = {
  widget: 'collection';
  label: EditorLabel;
  itemLabel: EditorLabel;
  min: number;
  max: number;
  item: EditorTilemapSpec;
  defaults: EditorItemContent[];
};

export type EditorItemContent = { properties: Record<string, unknown>; rows: string[] };

export type EditorParamValue = string | number | boolean;

/** A game-wide scalar tunable; the label names the Tuning slider. */
export type EditorParamSpec = EditorPropertySpec & { label: EditorLabel; default: EditorParamValue };

export type EditorDefinition = {
  version: 1;
  params?: Record<string, EditorParamSpec>;
  content: Record<string, EditorCollectionSpec>;
};

/**
 * A whole content document: collections keyed by name, plus param values under
 * the reserved `params` key when the game declares tunables.
 */
export type EditorContentDoc = Record<string, EditorItemContent[] | Record<string, EditorParamValue> | undefined>;

export type GameEditorState = {
  version: string;
  definition: EditorDefinition;
  /** The content the delivered version ships (its generated defaults). */
  content: EditorContentDoc;
  draft: { content: EditorContentDoc; revision: number; updatedAt: string } | null;
};

export async function fetchGameEditor(slug: string): Promise<GameEditorState> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/editor`, {
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as GameEditorState;
}

export type EditorDraftSaved = { revision: number; updatedAt: string };

/** Saves the whole draft snapshot. 409 (stale base) and 422 (schema/moderation) surface as errors with `status`. */
export async function putEditorDraft(
  slug: string,
  content: EditorContentDoc,
  baseRevision?: number,
): Promise<EditorDraftSaved> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/editor/draft`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(baseRevision === undefined ? { content } : { content, baseRevision }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as EditorDraftSaved;
}

export async function deleteEditorDraft(slug: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/editor/draft`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
}

/** Promotes the saved draft into a gated candidate version. 429 carries the cooldown. */
export async function publishEditorContent(slug: string): Promise<{ version: string; jobId: number }> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/editor/publish`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as { version: string; jobId: number };
}

export type AssistLane = 'params' | 'content' | 'code' | 'reject';

export type AssistResponse = {
  lane: AssistLane;
  /** Only on the `params` lane: what changed, and the document to save. */
  patches?: Array<{ key: string; value: EditorParamValue }>;
  content?: EditorContentDoc;
  summary?: { en: string; pl: string };
};

/**
 * Ask the tuning router to turn a sentence into a params patch.
 *
 * Returns a *proposal*: the caller applies it by saving the returned document
 * through `putEditorDraft`, so validation and moderation run on exactly the same
 * path a slider drag takes. 503 means the lane is switched off for this
 * deployment; 429 is the daily cap.
 */
export async function requestEditorAssist(
  slug: string,
  utterance: string,
  content: EditorContentDoc,
): Promise<AssistResponse> {
  const response = await fetch(`${API_BASE}/api/me/games/${encodeURIComponent(slug)}/editor/assist`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ utterance, content }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as AssistResponse;
}

export type StudioHealthResponse = {
  days: string[];
  truncated: boolean;
  gamesTruncated?: boolean;
  totalGames?: number;
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

export type StudioApiError = Error & {
  status?: number;
  category?: string;
  /** Per-problem validation detail from the editor routes (422). */
  problems?: string[];
  /** The revision that actually won a draft conflict (409). */
  revision?: number;
  /** How long the publish cooldown has left (429). */
  retryAfterMs?: number;
};

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function throwResponseError(response: Response): Promise<never> {
  const body = (await readJson(response)) as {
    error?: string;
    category?: string;
    problems?: unknown;
    revision?: unknown;
    retryAfterMs?: unknown;
  } | null;
  const error = new Error(body?.error ?? `Request failed (${response.status})`) as StudioApiError;
  error.status = response.status;
  error.category = body?.category;
  // Structured detail the editor routes send alongside `error`. Dropping it made
  // the panel's per-problem feedback dead code and cost the cooldown its number.
  if (Array.isArray(body?.problems) && body.problems.every((problem) => typeof problem === 'string')) {
    error.problems = body.problems as string[];
  }
  if (typeof body?.revision === 'number') error.revision = body.revision;
  if (typeof body?.retryAfterMs === 'number') error.retryAfterMs = body.retryAfterMs;
  throw error;
}

/** The signed-in creator's control-panel shelf (slug + publish time when known). */
export type StudioGamesResponse = {
  games: StudioGame[];
  truncated: boolean;
  totalGames: number;
};

/** The signed-in creator's control-panel shelf (slug + publish time when known). */
export async function fetchStudioGames(): Promise<StudioGamesResponse> {
  const response = await fetch(`${API_BASE}/api/me/studio`, { credentials: 'include' });
  if (!response.ok) {
    await throwResponseError(response);
  }
  const body = (await response.json()) as {
    games?: StudioGame[];
    truncated?: boolean;
    totalGames?: number;
  };
  const games = body.games ?? [];
  return {
    games,
    truncated: body.truncated ?? false,
    totalGames: body.totalGames ?? games.length,
  };
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
 *
 * Publishing is terminal, so this opens a *new* job: the response carries that job's
 * own `jobId` and a fresh `token` addressing it, and the caller hands the creator's
 * thread over to it. The field was declared `issueNumber` here while the server has
 * always sent `jobId` — a mismatch that only ever read as `undefined`; keep the wire
 * name (`jobId`) and correct the type.
 */
export async function submitImprovement(
  token: string,
  feedback: string,
  context?: FeedbackContext,
  builder?: 'platform' | 'self',
): Promise<{ ok: boolean; jobId: number; token: string; slug: string; shotId?: string }> {
  const response = await fetch(`${API_BASE}/api/submissions/${encodeURIComponent(token)}/improve`, {
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
  return (await response.json()) as { ok: boolean; jobId: number; token: string; slug: string; shotId?: string };
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
