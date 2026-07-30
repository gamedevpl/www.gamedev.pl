// Client for the operator console's own reads and writes — the queue lives in
// adminJobsApi, the telemetry in healthApi, and this covers the rest.
//
// Same posture as both of those: 404 means "not an admin" and comes back as `null`
// rather than as an error, because the operator surface does not confirm its own
// existence to someone who is not one.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type OperatorAlertKind =
  'review_ready' | 'build_failed' | 'build_stalled' | 'feedback_undelivered' | 'game_unhealthy';

export interface OperatorAlert {
  id: string;
  kind: OperatorAlertKind;
  issueNumber: number;
  title: string;
  ownerUid: string;
  slug?: string;
  since: string;
  stall?: 'awaiting_input' | 'not_dispatched' | 'quiet' | 'gate_not_started';
}

export interface AdminSummary {
  alerts: OperatorAlert[];
  queue: { active: number; stalled: number; byState: Record<string, number> };
  limits: { paused: boolean; globalDailySubmissionCap: number; todaySubmissions: number };
}

/**
 * The console's admission test as well as its header.
 *
 * Null is the whole answer for a non-operator: the nav draws no link, the page renders
 * "not found", and neither has to know why.
 */
export async function fetchAdminSummary(): Promise<AdminSummary | null> {
  const res = await fetch(`${API_BASE}/api/admin/summary`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`admin summary failed (${res.status})`);
  return (await res.json()) as AdminSummary;
}

export interface CreationLimits {
  stored: { paused?: boolean; globalDailySubmissionCap?: number | null; updatedAt?: string; updatedBy?: string } | null;
  effective: { paused: boolean; globalDailySubmissionCap: number };
  today: { dateStr: string; submissions: number };
  propagationMs: number;
}

export async function fetchCreationLimits(): Promise<CreationLimits | null> {
  const res = await fetch(`${API_BASE}/api/admin/creation-limits`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`creation limits failed (${res.status})`);
  return (await res.json()) as CreationLimits;
}

/**
 * Pulls or resets the breaker. Returns the state that is now in force, so the panel
 * renders what the server agreed to rather than what the click asked for.
 *
 * `globalDailySubmissionCap: null` clears the stored ceiling — a different intent from
 * setting a number, and the API distinguishes them.
 */
export async function setCreationLimits(patch: {
  paused?: boolean;
  globalDailySubmissionCap?: number | null;
}): Promise<CreationLimits | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/creation-limits`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.ok) return (await res.json()) as CreationLimits;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export interface Suggestion {
  slug: string;
  class: 'defect' | 'friction' | 'design-change' | 'healthy' | 'insufficient-data';
  priority: number;
  evidence: Array<{ finding: string; metrics: Record<string, number | null> }>;
  untrustedContext: {
    errorSamples: Array<{ message: string; count: number }>;
    progressLabels: Array<{ label: string; sessions: number }>;
    feedbackThemes: Array<{ theme: string; count: number }>;
  };
  computedFrom: string;
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
  computedFrom: string | null;
}

export async function fetchSuggestions(): Promise<SuggestionsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/suggestions`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`suggestions failed (${res.status})`);
  return (await res.json()) as SuggestionsResponse;
}

export interface JobCostSummary {
  issueNumber: number;
  title: string;
  slug?: string;
  state?: string;
  sessions: number;
  credits: number;
  gateRuns: number;
  tokens?: { input: number; output: number };
  usd?: number;
  elapsedMs: number;
  published: boolean;
  createdAt: string;
}

export interface CostReport {
  jobs: JobCostSummary[];
  totals: {
    jobs: number;
    sessions: number;
    credits: number;
    gateRuns: number;
    published: number;
    tokens?: { input: number; output: number };
    usd?: number;
  };
  creditsPerPublishedGame: number | null;
  usdPerPublishedGame: number | null;
  medianTimeToPublishMs: number | null;
  creditsOnUnpublished: number;
  usdOnUnpublished: number;
  unmeasuredJobs: number;
}

export async function fetchCostReport(): Promise<CostReport | null> {
  const res = await fetch(`${API_BASE}/api/admin/costs`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`cost report failed (${res.status})`);
  return (await res.json()) as CostReport;
}

export interface AccessToken {
  tokenId: string;
  uid: string;
  name: string;
  createdAt: string;
  createdByUid: string;
  expiresAt: string;
  lastUsedAt: string | null;
  expired: boolean;
}

/** Tokens are listed per account — there is no "every token on the site" read. */
export async function fetchAccessTokens(uid: string): Promise<AccessToken[] | null> {
  const res = await fetch(`${API_BASE}/api/admin/access-tokens?uid=${encodeURIComponent(uid)}`, {
    credentials: 'include',
  });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`access tokens failed (${res.status})`);
  return ((await res.json()) as { tokens: AccessToken[] }).tokens;
}

/**
 * Mints a token. The secret comes back exactly once — it is not stored anywhere it
 * could be read again, which is why the panel makes a point of saying so.
 */
export async function mintAccessToken(input: {
  uid: string;
  name: string;
  expiresInDays?: number;
}): Promise<(AccessToken & { token: string; accountCreated?: boolean }) | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/access-tokens`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.ok) return (await res.json()) as AccessToken & { token: string; accountCreated?: boolean };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export async function revokeAccessToken(tokenId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/admin/access-tokens/${encodeURIComponent(tokenId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return { ok: res.ok };
}
