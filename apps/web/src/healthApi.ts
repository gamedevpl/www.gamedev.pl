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
