// Ops console imports these telemetry reads; session cookie authenticates.

import type { ReviewerCohort, GameHealth, FramePerformanceGroup, LocalCodeMetrics } from '@gamedevpl/contract';

export type { GameHealth };
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface HealthResponse {
  days: string[];
  truncated: boolean;
  games: GameHealth[];
  performance?: {
    groups: FramePerformanceGroup[];
    truncated: boolean;
    measuredSessions: number;
    unmeasuredSessions: number;
  };
}

// Non-admins receive null; real failures throw.
export async function fetchGameHealth(
  days: number,
  performanceReviewers: ReviewerCohort = 'include',
): Promise<HealthResponse | null> {
  const res = await fetch(
    `${API_BASE}/api/admin/telemetry/health?days=${days}&performanceReviewers=${performanceReviewers}`,
    {
      credentials: 'include',
    },
  );
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
  sharing?: Array<{ step: string; visits: number }>;
  // Framed /play/ interstitial. Optional: old payloads omit it.
  framedPlay?: Array<{ step: string; visits: number }>;
  invites?: Array<{ step: string; visits: number }>;
  // Party lifecycle in step order; seatVisits means a seat drove it.
  party?: Array<{ step: string; visits: number; barVisits: number; seatVisits: number }>;
  betaWelcome?: Array<{ step: string; visits: number }>;
  /** EditorKit revision funnel in step order, every step present even at zero. */
  editing: Array<{ step: string; visits: number }>;
  // NL tuning outcomes; optional since a client can outlive a deploy.
  assisting?: Array<{ step: string; visits: number }>;
  coding?: Array<{ step: string; visits: number }>;
  cli?: Array<{ step: string; visits: number }>;
  // The CLI pilot read (CL-39); optional like its neighbours.
  cliPilot?: {
    sessions: number;
    delivered: number;
    published: number;
    adapters: Array<{ adapter: string; offered: number; used: number }>;
    verifyFailures: Array<{ stage: string; sessions: number }>;
    installs: Array<{ channel: string; sessions: number }>;
    platforms: Array<{ os: string; sessions: number }>;
  };
  // NP-1v concept proposals; optional like its neighbours.
  proposals?: {
    exposed: number;
    decided: number;
    picked: number;
    postponed: number;
    muted: number;
    byBuilder: Array<{
      builder: string;
      exposed: number;
      decided: number;
      picked: number;
      postponed: number;
      muted: number;
    }>;
  };
  // Game handovers, both sides; optional like its neighbours.
  transfers?: {
    sent: number;
    cancelled: number;
    offered: number;
    answered: number;
    accepted: number;
    declined: number;
  };
  imageExport?: { requested: number; saved: number; dismissed: number; failed?: number; rejected: number };
  localCode?: LocalCodeMetrics;
  completion?: {
    requests: number;
    shown: number;
    empty: number;
    failed: number;
    byKind: Array<{
      kind: string;
      requests: number;
      shown: number;
      empty: number;
      failed: number;
      medianLatencyMs: number | null;
      p90LatencyMs: number | null;
    }>;
  };
  /** The player-side remix loop. Optional for the same client-outlives-deploy reason. */
  remixing?: Array<{ step: string; visits: number }>;
  /** Which door brought painting visits to the brush. Optional, same reason. */
  remixPaintedVia?: Array<{ via: string; visits: number }>;
  /**
   * Whether the remix entry earns its place: visits shown the control, visits
   * that pressed it, which control, and how far into the visit. Optional for the
   * same client-outlives-deploy reason as its neighbours.
   */
  remixEntry?: {
    offered: number;
    opened: number;
    byControl: Array<{ control: string; visits: number }>;
    /** null means nobody opened one — not that they opened it instantly. */
    medianSecondsToOpen: number | null;
  };
  /** How to play card usage — open rate, repeats, and where it was opened. */
  howToPlay: HowToPlayFunnel;
  // Which surface started each play; optional, same client-outlives-deploy reason.
  playVia?: Array<{ via: string; plays: number }>;
}

export interface VisitsResponse {
  days: string[];
  truncated: boolean;
  funnel: VisitFunnel;
}

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

export interface DailyActivityPoint {
  date: string;
  visits: number;
  plays: number;
  creations: number;
  truncated: boolean;
}

export interface DailyMcpPoint {
  date: string;
  selfChosen: number;
  platformChosen: number;
  connected: number;
  signaled: number;
  gateVerdicts: number;
  truncated: boolean;
}

export interface DailyRetentionPoint {
  date: string;
  eligible: number;
  returned: number;
  rate: number | null;
}

export interface TrendsResponse {
  days: string[];
  truncated: boolean;
  activity: DailyActivityPoint[];
  mcp: DailyMcpPoint[];
  retention: DailyRetentionPoint[];
}

/** Same 404-means-not-for-you contract as the other operator reads. */
export async function fetchTelemetryTrends(days: number): Promise<TrendsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/telemetry/trends?days=${days}`, {
    credentials: 'include',
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Trends request failed (${res.status})`);
  }
  return (await res.json()) as TrendsResponse;
}

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
