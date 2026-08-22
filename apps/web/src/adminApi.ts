// Client for the operator console's own reads and writes — the queue lives in
// adminJobsApi, the telemetry in healthApi, and this covers the rest.
//
// Same posture as both of those: 404 means "not an admin" and comes back as `null`
// rather than as an error, because the operator surface does not confirm its own
// existence to someone who is not one.

import type {
  BetaInviteStatus,
  ManagedAgentVendorName,
  ReviewSweepSource,
  ReviewSweepStatus,
  WaitlistStatus,
} from '@gamedevpl/contract';
import type { JobStall } from './adminJobsApi.js';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export type OperatorAlertKind =
  'review_ready' | 'build_failed' | 'build_stalled' | 'feedback_undelivered' | 'game_unhealthy' | 'seeding_degraded';

export interface OperatorAlert {
  id: string;
  kind: OperatorAlertKind;
  /** Absent on alerts that are about the platform rather than one job. */
  issueNumber?: number;
  title: string;
  ownerUid?: string;
  slug?: string;
  since: string;
  stall?: JobStall;
}

export interface AdminSummary {
  alerts: OperatorAlert[];
  queue: { active: number; stalled: number; byState: Record<string, number> };
  limits: { paused: boolean; globalDailySubmissionCap: number; todaySubmissions: number };
  waitlist: { pending: number };
}

export type { WaitlistStatus };

export interface WaitlistEntry {
  uid: string;
  email?: string;
  name?: string;
  requestedAt: string;
  locale?: string;
  status: WaitlistStatus;
}

export type { BetaInviteStatus };

export interface BetaInvite {
  id: string;
  createdAt: string;
  createdByUid: string;
  status: BetaInviteStatus;
  claimedAt?: string;
  claimedUid?: string;
  revokedAt?: string;
  revokedByUid?: string;
}

/**
 * The console's admission test as well as its header. Null is the whole answer for a
 * non-operator: the nav draws no link, the page renders "not found", and neither has
 * to know why.
 */
export async function fetchAdminSummary(): Promise<AdminSummary | null> {
  const res = await fetch(`${API_BASE}/api/admin/summary`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`admin summary failed (${res.status})`);
  return (await res.json()) as AdminSummary;
}

import type { ManagedBuilderMode } from '@gamedevpl/contract';
export type { ManagedBuilderMode };
export type ManagedAgentVendor = ManagedAgentVendorName;
export type SeedingMode = 'auto' | 'off';

export interface CreationLimits {
  stored: {
    paused?: boolean;
    globalDailySubmissionCap?: number | null;
    managedBuilderMode?: ManagedBuilderMode;
    managedAgentVendorOverride?: ManagedAgentVendor | null;
    managedDailyCap?: number | null;
    managedDailyUserCap?: number | null;
    tabCompletePaused?: boolean;
    globalDailyTabCompleteTokenCap?: number | null;
    // Round 0's kill switch and provider picker.
    seedingMode?: SeedingMode;
    seedProviderOverride?: string | null;
    updatedAt?: string;
    updatedBy?: string;
  } | null;
  effective: {
    paused: boolean;
    globalDailySubmissionCap: number;
    managedBuilderMode: ManagedBuilderMode;
    managedDailyCap: number | null;
    managedDailyUserCap: number | null;
    hasPlatformBackend: boolean;
    managedAgentVendor: {
      stored: ManagedAgentVendor | null;
      effective: ManagedAgentVendor | null;
      available: boolean;
      configuredVendors: ManagedAgentVendor[];
      defaultVendor: ManagedAgentVendor | null;
    };
    // TA-01's breaker — off/on and the shared daily token ceiling.
    tabCompletePaused: boolean;
    globalDailyTabCompleteTokenCap: number;
    seedingMode: SeedingMode;
    seedProvider: {
      stored: string | null;
      effective: string;
      available: boolean;
      configuredProviders: string[];
      defaultProvider: string | null;
    };
  };
  today: { dateStr: string; submissions: number; managedBuilds: number; tabCompleteTokens: number };
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
  managedBuilderMode?: ManagedBuilderMode;
  managedAgentVendorOverride?: ManagedAgentVendor | null;
  managedDailyCap?: number | null;
  managedDailyUserCap?: number | null;
  tabCompletePaused?: boolean;
  globalDailyTabCompleteTokenCap?: number | null;
  seedingMode?: SeedingMode;
  seedProviderOverride?: string | null;
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

export interface PublicPlay {
  stored: { slugs: string[]; updatedAt?: string; updatedBy?: string } | null;
  effective: { slugs: string[] };
  propagationMs: number;
}

export async function fetchPublicPlay(): Promise<PublicPlay | null> {
  const res = await fetch(`${API_BASE}/api/admin/public-play`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`public play failed (${res.status})`);
  return (await res.json()) as PublicPlay;
}

export async function setPublicPlaySlugs(slugs: string[]): Promise<PublicPlay | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/public-play`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slugs }),
  });
  if (res.ok) return (await res.json()) as PublicPlay;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

// The home page's curated flagship pool; order matters.
export interface FeaturedPool {
  stored: { slugs: string[]; updatedAt?: string; updatedBy?: string } | null;
  slugs: string[];
}

export async function fetchFeaturedPool(): Promise<FeaturedPool | null> {
  const res = await fetch(`${API_BASE}/api/admin/featured-pool`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`featured pool failed (${res.status})`);
  return (await res.json()) as FeaturedPool;
}

export async function setFeaturedPoolSlugs(slugs: string[]): Promise<FeaturedPool | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/featured-pool`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slugs }),
  });
  if (res.ok) return (await res.json()) as FeaturedPool;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export type { ReviewSweepSource, ReviewSweepStatus };

export interface ReviewSweepProgress {
  total: number;
  released: number;
  remainingInPool: number;
  assessedReleased: number;
  status: ReviewSweepStatus;
  releasePerDay: number | null;
}

export interface ReviewSweepOpen {
  id: string;
  status: ReviewSweepStatus;
  source: ReviewSweepSource;
  slugs: string[];
  releasedCount: number;
  releasePerDay: number | null;
  startedAt: string;
  note: string | null;
  createdAt: string;
  createdBy: string;
  notifiedAt: string | null;
  notifiedCount: number;
  progress: ReviewSweepProgress;
  slugsPreview: string[];
}

export interface ReviewSweepListItem {
  id: string;
  status: ReviewSweepStatus;
  source: ReviewSweepSource;
  total: number;
  released: number;
  createdAt: string;
  createdBy: string;
  notifiedAt: string | null;
  notifiedCount: number;
  releasePerDay: number | null;
  note: string | null;
}

export interface ReviewSweepsResponse {
  open: ReviewSweepOpen | null;
  recent: ReviewSweepListItem[];
  reviewerCount: number;
}

export async function fetchReviewSweeps(): Promise<ReviewSweepsResponse | null> {
  const res = await fetch(`${API_BASE}/api/admin/review-sweeps`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`review sweeps failed (${res.status})`);
  return (await res.json()) as ReviewSweepsResponse;
}

export async function createReviewSweep(input: {
  source?: ReviewSweepSource;
  maxGames?: number;
  releasePerDay?: number | null;
  note?: string | null;
  notify?: boolean;
}): Promise<{ sweep: ReviewSweepOpen; notified: number } | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/review-sweeps`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.ok) return (await res.json()) as { sweep: ReviewSweepOpen; notified: number };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export async function patchReviewSweep(
  id: string,
  patch: {
    status?: ReviewSweepStatus;
    releaseMore?: number;
    releaseAll?: boolean;
    releasePerDay?: number | null;
    notify?: boolean;
    note?: string | null;
  },
): Promise<{ sweep: ReviewSweepOpen; notified: number } | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/review-sweeps/${encodeURIComponent(id)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (res.ok) return (await res.json()) as { sweep: ReviewSweepOpen; notified: number };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export interface Suggestion {
  slug: string;
  class: 'defect' | 'friction' | 'design-change' | 'editorial' | 'healthy' | 'insufficient-data';
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

export async function fetchWaitlist(status?: WaitlistStatus | 'all'): Promise<WaitlistEntry[] | null> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/api/admin/waitlist${query}`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`waitlist failed (${res.status})`);
  return ((await res.json()) as { entries: WaitlistEntry[] }).entries;
}

export async function setWaitlistStatus(
  uid: string,
  status: WaitlistStatus,
): Promise<WaitlistEntry | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/waitlist/${encodeURIComponent(uid)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (res.ok) return (await res.json()) as WaitlistEntry;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

/**
 * Pre-approve (or reject / reset) by email. Creates an `email:` row when the person
 * has never joined — same write the `beta:approve` CLI makes.
 */
export async function setWaitlistStatusByEmail(
  email: string,
  status: WaitlistStatus = 'approved',
): Promise<WaitlistEntry | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/waitlist`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, status }),
  });
  if (res.ok) return (await res.json()) as WaitlistEntry;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export async function fetchBetaInvites(): Promise<BetaInvite[] | null> {
  const res = await fetch(`${API_BASE}/api/admin/beta-invites`, { credentials: 'include' });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`beta invites failed (${res.status})`);
  return ((await res.json()) as { invites: BetaInvite[] }).invites;
}

export async function createBetaInvite(): Promise<{ invite: BetaInvite; code: string } | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/beta-invites`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.ok) return (await res.json()) as { invite: BetaInvite; code: string };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}

export async function revokeBetaInvite(id: string): Promise<BetaInvite | { error: string }> {
  const res = await fetch(`${API_BASE}/api/admin/beta-invites/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    credentials: 'include',
  });
  if (res.ok) return (await res.json()) as BetaInvite;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return { error: body.error ?? `request failed (${res.status})` };
}
