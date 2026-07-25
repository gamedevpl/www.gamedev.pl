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
