// Client for the operator telemetry view (docs/improvement-loop-plan.md IL-2). The
// session cookie authenticates; the API answers 404 rather than 403 to anyone who is
// not an admin, so `null` here means "not for you" and is not an error worth showing.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GameHealth {
  slug: string;
  sessions: number;
  bounces: number;
  closes: number;
  medianPlaySeconds: number;
  totalPlaySeconds: number;
  errors: number;
  errorSamples: Array<{ message: string; count: number }>;
  aliveTicks: number;
  stalledTicks: number;
  stallRate: number;
  medianFps: number | null;
  resumeTicksIgnored: number;
  /** Rounds that reached a conclusion, by outcome. Counted per round, not per session. */
  outcomes: { won: number; lost: number; quit: number };
  sessionsWithEnding: number;
  /** Sessions that finished a round, over all sessions. */
  finishRate: number;
  /** Sessions issued a seat in a shared world; 0 for a game that declares no zone. */
  zoneAdmitted: number;
  /** Of those, how many had a world actually arrive. */
  zoneJoined: number;
  /** `zoneJoined / zoneAdmitted`, or null when this game never asked for a zone. */
  zoneJoinRate: number | null;
  /** `won / (won + lost)`; null when no round was decided. Quits decide nothing. */
  winRate: number | null;
  /** Median across sessions of each session's best score; null when nothing scored. */
  medianBestScore: number | null;
  /** Landmarks reached, most-reached first. Game-authored text — render, never interpolate. */
  progressLabels: Array<{ label: string; sessions: number }>;
  /** Sessions that reported a render backend on progress/end (B18). */
  gfxBackends: { canvas2d: number; webgl: number; webgl3d: number };
}

export interface HealthResponse {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
}

/** Returns null when the caller is not an admin; throws only on a real failure. */
export async function fetchGameHealth(days: number): Promise<HealthResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/health?days=${days}`, {
    credentials: 'include',
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Health request failed (${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}

export interface HowToPlayFunnel {
  opens: number;
  visits: number;
  repeatVisits: number;
  via: Array<{ via: string; opens: number; visits: number }>;
  byEntry: Array<{ entry: string; playingVisits: number; visits: number; opens: number }>;
}

export interface VisitFunnel {
  visits: number;
  bounces: number;
  visitsWithPlay: number;
  plays: number;
  depth: Array<{ plays: number; visits: number }>;
  medianPlaysPerPlayingVisit: number;
  /** `upToSeconds: null` is the overflow bucket — slower than the widest named one. */
  timeToFirstPlay: Array<{ upToSeconds: number | null; visits: number }>;
  medianSecondsToFirstPlay: number;
  entries: Array<{ entry: string; visits: number; plays: number }>;
  referrers: Array<{ referrer: string; visits: number; plays: number }>;
  campaigns: Array<{ source?: string; medium?: string; campaign?: string; visits: number; plays: number }>;
  /** Creation funnel in step order, every step present even at zero. */
  creating: Array<{ step: string; visits: number }>;
  /** Closed-beta waitlist funnel in step order, every step present even at zero. */
  waitlist: Array<{ step: string; visits: number }>;
  /** EditorKit revision funnel in step order, every step present even at zero. */
  editing: Array<{ step: string; visits: number }>;
  /** How to play card usage — open rate, repeats, and where it was opened. */
  howToPlay: HowToPlayFunnel;
}

export interface VisitsResponse {
  days: string[];
  truncated: boolean;
  funnel: VisitFunnel;
}

/** Same 404-means-not-for-you contract as `fetchGameHealth`. */
export async function fetchVisitFunnel(days: number): Promise<VisitsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/visits?days=${days}`, {
    credentials: 'include',
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Visits request failed (${res.status})`);
  }
  return (await res.json()) as VisitsResponse;
}

export interface CreatorMetrics {
  published: number;
  eligibleForReturn: number;
  returnedWithin7Days: number;
  /** Null when no creator's 7-day window has elapsed yet. */
  d7ReturnRate: number | null;
  medianBuildMinutes: number | null;
  p90BuildMinutes: number | null;
  creators: number;
  gamesPerCreator: number | null;
}

export interface CreatorsResponse {
  sampled: number;
  metrics: CreatorMetrics;
}

/** Same 404-means-not-for-you contract as the other operator reads. */
export async function fetchCreatorMetrics(): Promise<CreatorsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/creators`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Creators request failed (${res.status})`);
  }
  return (await res.json()) as CreatorsResponse;
}

/**
 * The stored output of the nightly scorecard sweep, as written for IL-3.
 *
 * `untrusted` mirrors the server's shape deliberately: the field name is the thing that
 * makes it hard to paste game-authored text into an agent prompt by accident, so the
 * client keeps the same shape rather than flattening it for convenience.
 */
export interface Scorecard {
  slug: string;
  computedAt: string;
  window: { days: string[]; truncated: boolean };
  sessions: { count: number; bounces: number; closes: number; medianPlaySeconds: number; totalPlaySeconds: number };
  health: {
    errors: number;
    aliveTicks: number;
    stalledTicks: number;
    stallRate: number;
    medianFps: number | null;
    resumeTicksIgnored: number;
  };
  depth: {
    outcomes: { won: number; lost: number; quit: number };
    sessionsWithEnding: number;
    /** Null when the game reported no endings at all — render `—`, never `0%`. */
    finishRate: number | null;
    winRate: number | null;
    medianBestScore: number | null;
  };
  votes: { up: number; down: number };
  feedback: { count: number };
  untrusted: {
    errorSamples: Array<{ message: string; count: number }>;
    progressLabels: Array<{ label: string; sessions: number }>;
    /** Optional: scorecards written before theme extraction shipped do not carry it. */
    feedbackThemes?: Array<{ theme: string; count: number }>;
  };
}

export interface ScorecardsResponse {
  scorecards: Scorecard[];
  newestComputedAt: string | null;
  oldestComputedAt: string | null;
}

/** Same 404-means-not-for-you contract as the other operator reads. */
export async function fetchScorecards(): Promise<ScorecardsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/scorecards`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Scorecards request failed (${res.status})`);
  }
  return (await res.json()) as ScorecardsResponse;
}
