import {
  MANAGED_BUILDER_MODES,
  WAITLIST_STATUSES,
  type BetaInviteStatus,
  type ManagedBuilderMode,
} from '@gamedevpl/contract';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isAdminSession } from './admin-session.js';
import { MANAGED_AGENT_VENDORS } from '../agent-surface/agent-backend-env.js';
import { DEFAULT_SEED_PROVIDER } from '../creation/game-seed.js';
import {
  recentPartitions,
  scanPartitions,
  summarizeGameHealth,
  type GameHealth,
  type PartitionScanBudget,
} from './telemetry-health.js';
import { routeAll, type Suggestion } from '../community/suggestions.js';
import { buildJobQueue } from '../creation/job-admin-routes.js';
import type { JobState } from '../creation/job-state.js';
import { buildCostReport } from '../creation/job-costs.js';
import {
  detectOperatorAlerts,
  detectSeedingDegraded,
  SEEDING_DEGRADED_WINDOW_MS,
  type OperatorAlert,
} from '../notifications/operator-alerts.js';
import { summarizeVisitFunnel, type VisitFunnel } from '../telemetry/visit-funnel.js';
import { summarizeCreatorMetrics, type CreatorMetrics } from '../telemetry/creator-metrics.js';
import {
  summarizeRetentionByEligibilityDay,
  summarizeVisitDay,
  trendPartitions,
  type DailyActivityPoint,
  type DailyMcpPoint,
  type DailyRetentionPoint,
  type TelemetryTrends,
} from '../telemetry/telemetry-trends.js';
import {
  DEFAULT_CREATION_LIMITS_TTL_MS,
  resolveDefaultGlobalDailyCap,
  resolveDefaultGlobalDailyTabCompleteTokenCap,
} from '../creation/creation-limits.js';
import {
  BOT_UID_PREFIX,
  type BetaInvite,
  type CreationLimits,
  type FeaturedPoolConfig,
  type PublicPlayConfig,
  type Scorecard,
  type Store,
  type SubmissionRecord,
  type TelemetryEvent,
  type User,
  type VisitEvent,
  type WaitlistEntry,
} from './store.js';

/**
 * Operator-only reads over play telemetry (docs/improvement-loop-plan.md IL-2).
 *
 * The first read path for data IL-1 has been capturing since 2026-07-25. Scoped to
 * operators rather than creators for a reason worth keeping: a creator-facing scorecard
 * has to attribute a game to a person, attribution runs through `submissions.ownerUid`,
 * and most catalog games have no submission document — so a per-creator view would cover
 * a fraction of the catalog while claiming to answer "is my game working". The operator
 * view sidesteps attribution entirely and covers every published game.
 *
 * Raw events are never returned, only aggregates. That is the same rule the plan sets
 * for what agents may read, and it holds here for the same reason: an `error` message or
 * a `progress` label is game-controlled text, and a view that echoed it verbatim would
 * be an injection channel into whatever reads this next.
 */

/** Widest window one request may ask for. Each day is a separate Firestore query. */
const MAX_DAYS = 30;
const DEFAULT_DAYS = 7;
/** Trends need a longer window than a funnel glance — still bounded, still per-day. */
const MAX_TREND_DAYS = 90;
const DEFAULT_TREND_DAYS = 30;
/** Per-partition read cap, matching the store's own default. */
const MAX_EVENTS_PER_DAY = 1000;
const MAX_COMPLETION_EVENTS_PER_DAY = 500;
/**
 * Documents one request may read in total, across every partition it touches.
 *
 * The window alone does not bound cost: 30 days at the per-day cap is 30,000 document
 * reads for one click, and the widest window is exactly the one someone reaches for when
 * a game looks wrong. Budgeting the total keeps a quiet month cheap — at a few dozen
 * events a day the whole window costs about a thousand reads — and makes a busy one
 * degrade by narrowing the window rather than by silently costing thirty times more.
 */
const MAX_EVENTS_PER_REQUEST = 5_000;
const MAX_COMPLETION_EVENTS_PER_REQUEST = 2_000;
/** Trends walk every day in the window and discard events after summarizing, so the
 *  total can be wider than the funnel reads without holding them all in memory. */
const MAX_TREND_EVENTS_PER_REQUEST = 20_000;

const QuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_DAYS).optional(),
});

const TrendsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(MAX_TREND_DAYS).optional(),
});

export type TrendsResponse = TelemetryTrends;

export interface AdminRoutesOptions {
  store: Store;
  /** Uids permitted to read. Empty means the routes exist but admit nobody. */
  adminUids?: Set<string>;
  now?: () => number;
  /** Mirrors the submission routes' fallback ceiling, for the breaker view below. */
  globalDailySubmissionCap?: number;
  /** How long submission routes cache the breaker config — reported as the flip delay. */
  creationLimitsTtlMs?: number;
  publicPlayFallbackSlugs?: string[];
  publicPlayTtlMs?: number;
  // Whether a platform backend is configured. See managed-availability.ts.
  hasPlatformBackend?: boolean;
  // Vendors with a real backend built at boot; selectable by the override.
  configuredVendors?: string[];
  // MANAGED_AGENT_VENDOR — the fallback when no override is stored.
  defaultVendor?: string;
  // Seed vendors configured at boot; selectable by seedProviderOverride.
  configuredSeedProviders?: string[];
  // Fallback when no seed provider override is stored.
  defaultSeedProvider?: string;
}

/**
 * The creation circuit-breaker as an operator sees it: what is stored, what is actually
 * in force, and how much of today's shared allowance is gone.
 *
 * This exists because the breaker is only worth having if pulling it is fast. Editing a
 * Firestore document in the console works and needs no deploy, but under incident
 * conditions it is a lot of clicks to get a boolean wrong in, and it shows the operator
 * nothing about whether the cap is anywhere near tripping.
 */
export interface CreationLimitsResponse {
  /** Null when nothing has ever been written — the defaults below are what is in force. */
  stored: CreationLimits | null;
  effective: {
    paused: boolean;
    globalDailySubmissionCap: number;
    // `auto` defers to `hasPlatformBackend` below.
    managedBuilderMode: ManagedBuilderMode;
    managedDailyCap: number | null;
    managedDailyUserCap: number | null;
    // Independent of managedBuilderMode above.
    hasPlatformBackend: boolean;
    managedAgentVendor: {
      // Stored override, or null when unset.
      stored: string | null;
      // Override if it built, else the env default; null if neither.
      effective: string | null;
      // Whether `effective` names a vendor with a real backend.
      available: boolean;
      configuredVendors: string[];
      // MANAGED_AGENT_VENDOR, shown next to the override control.
      defaultVendor: string | null;
    };
    // TA-01's own breaker (creator-code-tab-autocomplete-research.md).
    tabCompletePaused: boolean;
    globalDailyTabCompleteTokenCap: number;
    // Round 0's kill switch and provider picker.
    seedingMode: 'auto' | 'off';
    seedProvider: {
      stored: string | null;
      effective: string;
      available: boolean;
      configuredProviders: string[];
      defaultProvider: string | null;
    };
  };
  today: { dateStr: string; submissions: number; managedBuilds: number; tabCompleteTokens: number };
  /** Upper bound, in ms, on how long a change takes to reach every instance. */
  propagationMs: number;
}

export interface PublicPlayResponse {
  stored: PublicPlayConfig | null;
  effective: { slugs: string[] };
  propagationMs: number;
}

// No fallback here — an empty pool is legitimate; the client falls back.
export interface FeaturedPoolResponse {
  stored: FeaturedPoolConfig | null;
  slugs: string[];
}

const CreationLimitsPatchSchema = z
  .object({
    paused: z.boolean().optional(),
    // null clears the stored ceiling and hands the decision back to the deployed
    // default, which is a different intent from setting a number.
    globalDailySubmissionCap: z.number().int().min(0).max(100_000).nullable().optional(),
    // The editing lanes' breaker rides the same document — one place to look.
    editingPaused: z.boolean().optional(),
    globalDailyEditCap: z.number().int().min(0).max(100_000).nullable().optional(),
    // The studio chat breaker rides the same document too.
    chatPaused: z.boolean().optional(),
    globalDailyChatCap: z.number().int().min(0).max(100_000).nullable().optional(),
    // TA-01's own breaker, denominated in tokens rather than calls.
    tabCompletePaused: z.boolean().optional(),
    globalDailyTabCompleteTokenCap: z.number().int().min(0).max(50_000_000).nullable().optional(),
    // Same document: whether the platform builder is offered. See managed-availability.ts.
    managedBuilderMode: z.enum(MANAGED_BUILDER_MODES).optional(),
    // null clears the override, same as globalDailySubmissionCap above.
    managedAgentVendorOverride: z.enum(MANAGED_AGENT_VENDORS).nullable().optional(),
    managedDailyCap: z.number().int().min(0).max(100_000).nullable().optional(),
    managedDailyUserCap: z.number().int().min(0).max(100_000).nullable().optional(),
    // Round 0's kill switch, same document as everything above.
    seedingMode: z.enum(['auto', 'off']).optional(),
    // Free-form, not an enum: providers self-register.
    seedProviderOverride: z.string().min(1).max(64).nullable().optional(),
  })
  .refine(
    (patch) =>
      patch.paused !== undefined ||
      patch.globalDailySubmissionCap !== undefined ||
      patch.editingPaused !== undefined ||
      patch.globalDailyEditCap !== undefined ||
      patch.chatPaused !== undefined ||
      patch.globalDailyChatCap !== undefined ||
      patch.tabCompletePaused !== undefined ||
      patch.globalDailyTabCompleteTokenCap !== undefined ||
      patch.managedBuilderMode !== undefined ||
      patch.managedAgentVendorOverride !== undefined ||
      patch.managedDailyCap !== undefined ||
      patch.managedDailyUserCap !== undefined ||
      patch.seedingMode !== undefined ||
      patch.seedProviderOverride !== undefined,
    'nothing to change: send paused, globalDailySubmissionCap, editingPaused, globalDailyEditCap, chatPaused, globalDailyChatCap, tabCompletePaused, globalDailyTabCompleteTokenCap, managedBuilderMode, managedAgentVendorOverride, managedDailyCap, managedDailyUserCap, seedingMode and/or seedProviderOverride',
  );

const PublicPlayPatchSchema = z.object({
  slugs: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid game slug'),
    )
    .max(100),
});

// Smaller cap than public play — a curated showcase, not an allowlist.
const FeaturedPoolPatchSchema = z.object({
  slugs: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid game slug'),
    )
    .max(30),
});

export interface HealthResponse {
  /**
   * Partitions actually scanned, most recent first — not necessarily the ones asked
   * for. A request that runs out of read budget reports the narrower window it really
   * measured, so a range shown to a reader is never wider than the range behind it.
   */
  days: string[];
  /** True when any partition hit a cap, so every count below is a floor. */
  truncated: boolean;
  games: GameHealth[];
}

export interface VisitsResponse {
  /** Partitions actually scanned, most recent first — same contract as `HealthResponse`. */
  days: string[];
  truncated: boolean;
  funnel: VisitFunnel;
}

/** Scorecards one request returns. The catalog is ~82 games, so this is the whole set. */
const MAX_SCORECARDS = 200;

export interface SuggestionsResponse {
  /** Worst first. Includes games the router passed over, so silence is legible. */
  suggestions: Suggestion[];
  /** Null when the scorecard sweep has never written anything for the router to read. */
  computedFrom: string | null;
}

export interface ScorecardsResponse {
  /** Newest computation first, so a stale sweep sorts to the bottom. */
  scorecards: Scorecard[];
  /** Null when the sweep has never run (or never written anything). */
  newestComputedAt: string | null;
  oldestComputedAt: string | null;
}

export interface CreatorsResponse {
  /** Published submissions sampled, newest first. Bounded like every other read here. */
  sampled: number;
  metrics: CreatorMetrics;
}

/**
 * How many recently published submissions the creator view reads.
 *
 * Each one costs a user lookup on top of its own document, so this is the knob that
 * keeps an operator page view a few dozen reads rather than unbounded.
 */
const MAX_SUBMISSIONS_SAMPLED = 100;

/**
 * How far back the cost report reaches, in published games.
 *
 * The window is what makes the answer useful: "what does a game cost" is a question
 * about the current pipeline, and averaging it against builds from three architectures
 * ago would produce a number that is true of nothing.
 */
const MAX_COST_SUBMISSIONS = 100;

/**
 * The one read the console header and the nav badge share.
 *
 * Everything in it is already answerable from other routes; what it adds is being cheap
 * enough to call on every page load. The nav needs two things — may this person see the
 * console at all, and is there anything in it demanding them — and getting those from
 * `/api/admin/jobs` would mean shipping the whole queue to draw one dot.
 */
export interface AdminSummaryResponse {
  /** Jobs waiting on a person, worst first. Short by construction — see operator-alerts. */
  alerts: OperatorAlert[];
  queue: { active: number; stalled: number; byState: Partial<Record<JobState, number>> };
  limits: { paused: boolean; globalDailySubmissionCap: number; todaySubmissions: number };
  /** Closed-beta applicants still waiting — drives the Waitlist tab badge. */
  waitlist: { pending: number };
}

export interface WaitlistListResponse {
  entries: WaitlistEntry[];
}

export interface BetaInviteResponse {
  id: string;
  createdAt: string;
  createdByUid: string;
  status: BetaInviteStatus;
  claimedAt?: string;
  claimedUid?: string;
  revokedAt?: string;
  revokedByUid?: string;
}

export interface CreatedBetaInviteResponse {
  invite: BetaInviteResponse;
  code: string;
}

/** How many waitlist rows one console read may return. Matches the store default. */
const MAX_WAITLIST_ENTRIES = 200;
const MAX_BETA_INVITES = 200;

const WaitlistStatusSchema = z.enum(WAITLIST_STATUSES);

const WaitlistListQuerySchema = z.object({
  status: WaitlistStatusSchema.optional(),
});

const WaitlistStatusBodySchema = z.object({
  status: WaitlistStatusSchema,
});

const WaitlistPreapproveSchema = z.object({
  email: z.string().trim().email('invalid email').max(254),
  status: WaitlistStatusSchema.default('approved'),
});

const BetaInviteIdSchema = z.object({
  id: z.string().uuid('invalid invite id'),
});

function betaInviteResponse(invite: BetaInvite): BetaInviteResponse {
  return {
    id: invite.id,
    createdAt: invite.createdAt,
    createdByUid: invite.createdByUid,
    status: invite.status,
    ...(invite.claimedAt ? { claimedAt: invite.claimedAt } : {}),
    ...(invite.claimedUid ? { claimedUid: invite.claimedUid } : {}),
    ...(invite.revokedAt ? { revokedAt: invite.revokedAt } : {}),
    ...(invite.revokedByUid ? { revokedByUid: invite.revokedByUid } : {}),
  };
}

const WaitlistUidParamsSchema = z.object({
  // Same shape the auth layer mints (`g:` / `a:`) plus the `email:` pre-approve prefix
  // the CLI and this surface use when the person has not signed in yet.
  uid: z
    .string()
    .trim()
    .regex(/^(?:g:|a:|email:)[^\s]+$/i, 'invalid uid'),
});

/**
 * This page's read budget. The walk itself lives in telemetry-health.ts, shared with the
 * scorecard sweep so an operator's numbers and an agent's cannot disagree about what
 * "truncated" means; only the ceiling differs, because a click and a nightly batch are
 * paying for different things.
 */
const REQUEST_BUDGET: PartitionScanBudget = { perDay: MAX_EVENTS_PER_DAY, total: MAX_EVENTS_PER_REQUEST };

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): Promise<void> {
  const { store, adminUids } = options;
  const now = options.now ?? Date.now;
  const defaultGlobalCap = resolveDefaultGlobalDailyCap(options.globalDailySubmissionCap);
  const creationLimitsTtlMs = options.creationLimitsTtlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const publicPlayFallbackSlugs = options.publicPlayFallbackSlugs ?? [];
  const publicPlayTtlMs = options.publicPlayTtlMs ?? DEFAULT_CREATION_LIMITS_TTL_MS;
  const configuredVendors = new Set(options.configuredVendors ?? []);
  const defaultVendor = options.defaultVendor ?? null;
  const configuredSeedProviders = new Set(options.configuredSeedProviders ?? []);
  const defaultSeedProvider = options.defaultSeedProvider ?? null;

  /** Reads the stored breaker plus today's spend, uncached — an operator wants truth. */
  async function readCreationLimits(): Promise<CreationLimitsResponse> {
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    const [stored, submissions, managedBuilds, tabCompleteTokens] = await Promise.all([
      store.getCreationLimits(),
      store.getGlobalSubmissionCount(dateStr),
      store.getGlobalManagedBuildCount(dateStr),
      store.getGlobalTabCompleteTokenCount(dateStr),
    ]);
    const storedVendor = stored?.managedAgentVendorOverride ?? null;
    // An invalid default must not report as effective when nothing overrode it.
    const validDefaultVendor = defaultVendor && configuredVendors.has(defaultVendor) ? defaultVendor : null;
    const effectiveVendor = storedVendor && configuredVendors.has(storedVendor) ? storedVendor : validDefaultVendor;
    const storedSeedProvider = stored?.seedProviderOverride ?? null;
    const validDefaultSeedProvider =
      defaultSeedProvider && configuredSeedProviders.has(defaultSeedProvider) ? defaultSeedProvider : null;
    // Null here means no registry was ever built; vertex needs none.
    const effectiveSeedProvider =
      storedSeedProvider && configuredSeedProviders.has(storedSeedProvider)
        ? storedSeedProvider
        : (validDefaultSeedProvider ?? DEFAULT_SEED_PROVIDER);
    return {
      stored,
      effective: {
        paused: stored?.paused === true,
        globalDailySubmissionCap: stored?.globalDailySubmissionCap ?? defaultGlobalCap,
        managedBuilderMode: stored?.managedBuilderMode ?? 'auto',
        managedDailyCap: stored?.managedDailyCap ?? null,
        managedDailyUserCap: stored?.managedDailyUserCap ?? null,
        hasPlatformBackend: options.hasPlatformBackend === true,
        managedAgentVendor: {
          stored: storedVendor,
          effective: effectiveVendor,
          available: effectiveVendor !== null && configuredVendors.has(effectiveVendor),
          configuredVendors: [...configuredVendors],
          defaultVendor,
        },
        tabCompletePaused: stored?.tabCompletePaused === true,
        globalDailyTabCompleteTokenCap:
          stored?.globalDailyTabCompleteTokenCap ?? resolveDefaultGlobalDailyTabCompleteTokenCap(),
        seedingMode: stored?.seedingMode ?? 'auto',
        seedProvider: {
          stored: storedSeedProvider,
          effective: effectiveSeedProvider,
          available: configuredSeedProviders.has(effectiveSeedProvider),
          configuredProviders: [...configuredSeedProviders],
          defaultProvider: defaultSeedProvider,
        },
      },
      today: { dateStr, submissions, managedBuilds, tabCompleteTokens },
      propagationMs: creationLimitsTtlMs,
    };
  }

  async function readPublicPlay(): Promise<PublicPlayResponse> {
    const stored = await store.getPublicPlayConfig();
    return {
      stored,
      effective: { slugs: stored?.slugs ?? publicPlayFallbackSlugs },
      propagationMs: publicPlayTtlMs,
    };
  }

  async function readFeaturedPool(): Promise<FeaturedPoolResponse> {
    const stored = await store.getFeaturedPoolConfig();
    return { stored, slugs: stored?.slugs ?? [] };
  }

  /**
   * When each open job's oldest uncollected change request arrived.
   *
   * One query per active job, which is the only read on this route that is not O(1) —
   * paid because the alternative is a console whose alert list is missing the one kind
   * the sweep can see, and an operator learning to distrust the number. The active set
   * is open submissions only, and the sweep walks the same set every two minutes doing
   * strictly more work per record.
   */
  async function pendingFeedbackAges(records: SubmissionRecord[]): Promise<Map<number, string>> {
    const ages = new Map<number, string>();
    await Promise.all(
      records.map(async (record) => {
        const [oldest] = await store.listPendingCreatorMessages(record.issueNumber, { limit: 1 });
        if (oldest) ages.set(record.issueNumber, oldest.createdAt);
      }),
    );
    return ages;
  }

  /**
   * Console header and nav badge in one request.
   *
   * Same 404-to-everyone-else contract as the reads below, which is what makes it usable
   * as the admin test the client has never had: the web app has no idea who is an
   * operator, so until now the console could only be reached by knowing the URL and the
   * page could only say "not found" after the fact.
   */
  app.get('/api/admin/summary', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const at = now();
    const [records, limits, pendingWaitlist, seedOutcomes] = await Promise.all([
      store.listActiveSubmissions(),
      readCreationLimits(),
      store.countWaitlistEntries('pending'),
      // Same read the sweep does. The badge and the inbox have to agree about what is
      // wrong, or the number on the badge stops meaning anything — so the seeding alert
      // is derived here too rather than only where it is emailed.
      store.listSeedOutcomesSince(new Date(at - SEEDING_DEGRADED_WINDOW_MS).toISOString()).catch(() => []),
    ]);
    const queue = buildJobQueue(records, at);
    const seeding = detectSeedingDegraded(seedOutcomes, at);
    const body: AdminSummaryResponse = {
      alerts: [...detectOperatorAlerts(records, at, await pendingFeedbackAges(records)), ...(seeding ? [seeding] : [])],
      queue: { active: queue.jobs.length, stalled: queue.stalled, byState: queue.byState },
      limits: {
        paused: limits.effective.paused,
        globalDailySubmissionCap: limits.effective.globalDailySubmissionCap,
        todaySubmissions: limits.today.submissions,
      },
      waitlist: { pending: pendingWaitlist },
    };
    return reply.status(200).send(body);
  });

  /**
   * Closed-beta waitlist — list, approve, reject, pre-approve.
   *
   * Until this existed the only verbs were `npm run beta:approve` and the Firestore
   * console, which meant approving someone meant finding a laptop. The panel is the
   * same store writes the CLI makes; the CLI stays as the fallback for agents and
   * scripts (see `.claude/skills/managing-beta-participants/SKILL.md`).
   */
  app.get('/api/admin/waitlist', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = WaitlistListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const entries = await store.listWaitlistEntries({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      limit: MAX_WAITLIST_ENTRIES,
    });
    const body: WaitlistListResponse = { entries };
    return reply.status(200).send(body);
  });

  app.post<{ Params: { uid: string } }>('/api/admin/waitlist/:uid', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const params = WaitlistUidParamsSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid uid' });
    }
    const parsed = WaitlistStatusBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const entry = await store.setWaitlistStatus(params.data.uid, parsed.data.status);
    if (!entry) {
      return reply.status(404).send({ error: 'not found' });
    }
    app.log.info(
      { uid: entry.uid, status: entry.status, by: request.user!.uid },
      'waitlist status changed by operator',
    );
    return reply.status(200).send(entry);
  });

  /** Pre-approve (or reject) by email before the person has a uid row. */
  app.post('/api/admin/waitlist', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = WaitlistPreapproveSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const entry = await store.setWaitlistStatusByEmail(parsed.data.email, parsed.data.status);
    app.log.info(
      { uid: entry.uid, email: entry.email, status: entry.status, by: request.user!.uid },
      'waitlist status set by email by operator',
    );
    return reply.status(200).send(entry);
  });

  app.get('/api/admin/beta-invites', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const invites = await store.listBetaInvites({ limit: MAX_BETA_INVITES });
    return reply.status(200).send({ invites: invites.map(betaInviteResponse) });
  });

  app.post('/api/admin/beta-invites', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const created = await store.createBetaInvite(request.user!.uid);
    app.log.info({ inviteId: created.invite.id, by: request.user!.uid }, 'beta invite created');
    const response: CreatedBetaInviteResponse = {
      invite: betaInviteResponse(created.invite),
      code: created.code,
    };
    return reply.status(201).send(response);
  });

  app.post<{ Params: { id: string } }>('/api/admin/beta-invites/:id/revoke', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const params = BetaInviteIdSchema.safeParse(request.params ?? {});
    if (!params.success) {
      return reply.status(400).send({ error: params.error.issues[0]?.message ?? 'invalid invite id' });
    }
    const invite = await store.revokeBetaInvite(params.data.id, request.user!.uid);
    if (!invite) {
      return reply.status(409).send({ error: 'invite is unavailable' });
    }
    app.log.info({ inviteId: invite.id, by: request.user!.uid }, 'beta invite revoked');
    return reply.status(200).send(betaInviteResponse(invite));
  });

  /**
   * What building games has cost, per job and in aggregate.
   *
   * Reads the jobs in flight plus the last {@link MAX_COST_SUBMISSIONS} that published —
   * deliberately not "everything ever", because the answer worth having is what a game
   * costs *now*, and a window that reached back to launch would average today against a
   * pipeline that no longer exists. It also bounds the read, like every other route here.
   *
   * A job appears in the window whether or not it has a ledger. One dispatched before
   * any of this was recorded contributes nothing and is counted in `unmeasuredJobs`, so
   * a small total reads as "not measured yet" rather than as "cheap".
   */
  app.get('/api/admin/costs', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const [active, published] = await Promise.all([
      store.listActiveSubmissions(),
      store.listRecentlyPublished(MAX_COST_SUBMISSIONS),
    ]);
    // A job can be in both lists — active is "not abandoned and not yet notified as
    // published", which a freshly published one still satisfies. Counting it twice would
    // double its credits in the very total the report exists for.
    const byIssue = new Map<number, SubmissionRecord>();
    for (const record of [...active, ...published]) byIssue.set(record.issueNumber, record);

    return reply.status(200).send(buildCostReport([...byIssue.values()]));
  });

  app.get('/api/admin/creation-limits', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    return reply.status(200).send(await readCreationLimits());
  });

  /**
   * Pulls (or resets) the breaker. Session-only like every operator write, so a leaked
   * access token cannot pause the product.
   *
   * The change lands in Firestore rather than in the environment, so it needs no new
   * revision — which is the entire point: a redeploy mid-incident would drop every party
   * room in flight. Instances converge within `propagationMs`.
   */
  app.post('/api/admin/creation-limits', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = CreationLimitsPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    await store.setCreationLimits(parsed.data, request.user!.uid);
    // Log it: a pause left on by accident is the failure mode here, and the record of
    // who set it and when is what makes that legible later.
    app.log.warn({ patch: parsed.data, by: request.user!.uid }, 'creation limits changed by operator');
    return reply.status(200).send(await readCreationLimits());
  });

  app.get('/api/admin/public-play', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    return reply.status(200).send(await readPublicPlay());
  });

  app.post('/api/admin/public-play', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = PublicPlayPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const slugs = [...new Set(parsed.data.slugs)];
    await store.setPublicPlaySlugs(slugs, request.user!.uid);
    app.log.info({ slugs, by: request.user!.uid }, 'promotional play allowlist changed by operator');
    return reply.status(200).send(await readPublicPlay());
  });

  app.get('/api/admin/featured-pool', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    return reply.status(200).send(await readFeaturedPool());
  });

  // A stale (unpublished) slug fails safe on the public read, not here.
  app.post('/api/admin/featured-pool', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = FeaturedPoolPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    // Order preserved, duplicates dropped.
    const slugs = [...new Set(parsed.data.slugs)];
    await store.setFeaturedPoolSlugs(slugs, request.user!.uid);
    app.log.info({ slugs, by: request.user!.uid }, 'featured pool changed by operator');
    return reply.status(200).send(await readFeaturedPool());
  });

  app.get('/api/admin/telemetry/health', async (request, reply) => {
    // 404 rather than 403 for a signed-in non-admin: the existence of an operator
    // surface is not something a beta tester needs confirmed. An unauthenticated
    // request gets the same answer, so probing tells nobody anything.
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    // Newest day first, so exhausting the budget drops the oldest history rather than
    // the data most likely to be asked about.
    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const { events, scanned, truncated } = await scanPartitions<TelemetryEvent>(
      requested,
      REQUEST_BUDGET,
      (dateStr, limit) => store.listTelemetryEvents(dateStr, { limit }),
    );

    const body: HealthResponse = { days: scanned, truncated, games: summarizeGameHealth(events) };
    return reply.status(200).send(body);
  });

  /**
   * The visit funnel — the read half of the stream captured since 2026-07-25.
   *
   * Same operator gate as game health, and for a stronger reason: this view is about
   * how people arrive rather than how one game behaves, so it is the closest thing the
   * service has to a business dashboard. It still returns only aggregates, and the
   * underlying rows carry no identity to leak.
   */
  app.get('/api/admin/telemetry/visits', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const requested = recentPartitions(parsed.data.days ?? DEFAULT_DAYS, now());
    const core = await scanPartitions<VisitEvent>(requested, REQUEST_BUDGET, (dateStr, limit) =>
      store.listVisitEvents(dateStr, { limit, excludeType: 'code_completion' }),
    );
    const completion = await scanPartitions<VisitEvent>(
      requested,
      { perDay: MAX_COMPLETION_EVENTS_PER_DAY, total: MAX_COMPLETION_EVENTS_PER_REQUEST },
      (dateStr, limit) => store.listVisitEvents(dateStr, { limit, type: 'code_completion' }),
    );
    const events = [...core.events, ...completion.events];
    const scanned = [...new Set([...core.scanned, ...completion.scanned])];
    const truncated = core.truncated || completion.truncated;

    const body: VisitsResponse = { days: scanned, truncated, funnel: summarizeVisitFunnel(events) };
    return reply.status(200).send(body);
  });

  /**
   * Daily activity + D7 retention series for trend charts.
   *
   * Separate from the funnel reads: those answer "what happened in this window" as
   * one aggregate; this answers "is it getting better" as a time series. Each day is
   * summarized and discarded so a 90-day walk does not hold 90 days of raw events.
   */
  app.get('/api/admin/telemetry/trends', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const parsed = TrendsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
    }

    const requested = trendPartitions(parsed.data.days ?? DEFAULT_TREND_DAYS, now());
    const activity: DailyActivityPoint[] = [];
    const mcp: DailyMcpPoint[] = [];
    const scanned: string[] = [];
    let truncated = false;
    let readTotal = 0;

    for (const dateStr of requested) {
      const remaining = MAX_TREND_EVENTS_PER_REQUEST - readTotal;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
      const dayEvents = await store.listVisitEvents(dateStr, { limit });
      const dayTruncated = dayEvents.length >= limit;
      if (dayTruncated) truncated = true;
      readTotal += dayEvents.length;
      const day = summarizeVisitDay(dateStr, dayEvents, dayTruncated);
      activity.push(day.activity);
      mcp.push(day.mcp);
      scanned.push(dateStr);
    }

    const submissions = (await store.listRecentlyPublished(MAX_SUBMISSIONS_SAMPLED)).filter(
      (submission) => !submission.ownerUid.startsWith(BOT_UID_PREFIX),
    );
    const usersByUid = new Map<string, User>();
    for (const uid of new Set(submissions.map((submission) => submission.ownerUid))) {
      const user = await store.getUser(uid);
      if (user) usersByUid.set(uid, user);
    }

    const retention: DailyRetentionPoint[] = summarizeRetentionByEligibilityDay(
      submissions,
      usersByUid,
      scanned,
      now(),
    );

    const body: TrendsResponse = { days: scanned, truncated, activity, mcp, retention };
    return reply.status(200).send(body);
  });

  /**
   * Creator return and build economics — the two numbers Stage 0 gates on.
   *
   * Unlike the other two reads this one is not windowed by day: it samples the most
   * recently published submissions, because a D7 question is about what happened after
   * a publish, not about what happened inside a chosen week.
   */
  app.get('/api/admin/telemetry/creators', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    // Automation accounts are excluded: these two numbers are about whether *people*
    // come back and what their builds cost, and a bot account driven by a test suite
    // would report flawless retention for a creator who does not exist.
    const submissions = (await store.listRecentlyPublished(MAX_SUBMISSIONS_SAMPLED)).filter(
      (submission) => !submission.ownerUid.startsWith(BOT_UID_PREFIX),
    );

    // One lookup per distinct owner, not per submission: a prolific creator would
    // otherwise be fetched once per game they published.
    const usersByUid = new Map<string, User>();
    for (const uid of new Set(submissions.map((submission) => submission.ownerUid))) {
      const user = await store.getUser(uid);
      if (user) usersByUid.set(uid, user);
    }

    const body: CreatorsResponse = {
      sampled: submissions.length,
      metrics: summarizeCreatorMetrics(submissions, usersByUid, now()),
    };
    return reply.status(200).send(body);
  });

  /**
   * What the nightly scorecard sweep actually produced.
   *
   * The sweep writes `games/{slug}/scorecard/current` for IL-3 to read, and until this
   * existed nothing could read it back — an aggregate whose first observable symptom of
   * being wrong would be an agent acting on it. This is the operator's look at it, and
   * deliberately answers a *different* question from the game-health view above: that one
   * recomputes from raw events on demand, this one shows what was stored and **when**,
   * so a sweep that silently stopped running is visible as staleness rather than
   * invisible behind numbers that still look fresh because they were just recomputed.
   *
   * Same admin-session gate and 404-to-everyone-else contract as the other reads. The
   * `untrusted` block travels verbatim — safe here because it is rendered as text, and
   * the field name is what stops it being pasted into an agent prompt later.
   */
  /**
   * What the IL-3 router would say about every game it can see.
   *
   * Computed on read and persisted nowhere, deliberately: this is a suggestion engine
   * that will eventually file issues against people's games, and the honest order is to
   * let an operator watch what it *would* do for a while before it does anything. Nothing
   * here files, assigns, or notifies.
   */
  app.get('/api/admin/suggestions', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const scorecards = await store.listScorecards({ limit: MAX_SCORECARDS });
    const body: SuggestionsResponse = {
      suggestions: routeAll(scorecards),
      // Same freshness caveat as the scorecards read: the router is only as current as the
      // sweep behind it, and a stale answer should be visible as stale rather than trusted.
      computedFrom: scorecards[0]?.computedAt ?? null,
    };
    return reply.send(body);
  });

  app.get('/api/admin/scorecards', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const scorecards = await store.listScorecards({ limit: MAX_SCORECARDS });
    const body: ScorecardsResponse = {
      scorecards,
      // Freshness is the health of the *sweep* rather than of any game, so it is
      // computed here rather than left for each reader to derive from the rows.
      newestComputedAt: scorecards[0]?.computedAt ?? null,
      oldestComputedAt: scorecards[scorecards.length - 1]?.computedAt ?? null,
    };
    return reply.status(200).send(body);
  });
}
