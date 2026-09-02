import {
  ASSESSMENT_CHECKLIST_MARKS,
  ASSESSMENT_INPUT_METHODS,
  ASSESSMENT_NOTE_ORIGINS,
  ASSESSMENT_PLATFORMS,
  ASSESSMENT_SOURCES,
  ASSESSMENT_VERDICTS,
  REVIEW_SWEEP_SOURCES,
  REVIEW_SWEEP_STATUSES,
  type AssessmentNoteOrigin,
  type AssessmentSource,
  type AssessmentVerdict,
  type ReviewSweepSource,
} from '@gamedevpl/contract';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isAdmin, isAdminSession } from '../platform/admin-session.js';
import { paginateAssessments, parseAssessmentPageQuery, QueueQuerySchema } from './assessment-pagination.js';
import {
  matchesResolutionFilter,
  registerAssessmentResolutionRoute,
  summarizeResolutions,
} from './assessment-resolution.js';
import type { emitReviewSweep as EmitReviewSweep, EmitDeps } from '../notifications/notify.js';
import { ASSESSMENT_CHECKLIST_KEYS, isAssessmentChecklist } from './review-checklist.js';
import {
  effectiveReleasedCount,
  MAX_RELEASE_PER_DAY,
  MAX_SWEEP_GAMES,
  mintReviewSweepId,
  releasedSlugs,
  summarizeSweepProgress,
} from './review-sweep.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type {
  AssessmentChecklist,
  AssessmentClientContext,
  GameAssessment,
  ReReviewRequest,
  ReviewSweep,
  Store,
  SubmissionRecord,
} from '../platform/store.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NOTE = 2000;
const MAX_ADMIN_ROWS = 200;
const MAX_REQUEUE_SLUGS = 50;
const MAX_REQUEUE_REVIEWERS = 50;
const MAX_REQUEUE_PAIRS = 200;
const ChecklistMarkSchema = z.enum(ASSESSMENT_CHECKLIST_MARKS);
const ChecklistSchema = z
  .object({
    graphics: ChecklistMarkSchema,
    gameplay: ChecklistMarkSchema,
    fun: ChecklistMarkSchema,
    sound: ChecklistMarkSchema,
    controls: ChecklistMarkSchema,
  })
  .strict();
const MAX_QUEUE = 500;

export interface ReviewCatalogMedia {
  screenshots: Array<{ name: string; file: string }>;
  video: string | null;
}

export interface ReviewCatalogEntry {
  slug: string;
  title: string;
  creatorHandle: string | null;
  genre?: string | null;
  media?: ReviewCatalogMedia | null;
}

export interface ReviewQueueItem {
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  genre: string | null;
  jobId: number | null;
  media: ReviewCatalogMedia | null;
  // Set when an operator targeted this slug for re-review.
  reReview?: { reason: string | null; gameVersion: string | null; requestedAt: string } | null;
}

export interface ReviewRoutesOptions {
  store: Store;
  reviewerUids?: Set<string>;
  adminUids?: Set<string>;
  listCatalog?: () => Promise<ReviewCatalogEntry[]>;
  now?: () => number;
  emitDeps?: EmitDeps;
  // Injected so this module has no value-level notifications import.
  emitReviewSweep?: typeof EmitReviewSweep;
}

const ClientContextSchema = z
  .object({
    viewportW: z.number().int().min(1).max(10000),
    viewportH: z.number().int().min(1).max(10000),
    screenW: z.number().int().min(1).max(10000),
    screenH: z.number().int().min(1).max(10000),
    dpr: z.number().min(0.5).max(4),
    input: z.enum(ASSESSMENT_INPUT_METHODS),
    platform: z.enum(ASSESSMENT_PLATFORMS),
    lang: z.string().trim().min(1).max(32).nullable().optional(),
    ua: z.string().trim().min(1).max(160).nullable().optional(),
  })
  .strict();

const AssessmentBodySchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
  source: z.enum(ASSESSMENT_SOURCES),
  title: z.string().trim().min(1).max(120).optional(),
  creatorHandle: z.string().trim().min(1).max(40).nullable().optional(),
  verdict: z.enum(ASSESSMENT_VERDICTS),
  note: z.string().trim().min(1).max(MAX_NOTE),
  noteOrigin: z.enum(ASSESSMENT_NOTE_ORIGINS).exclude(['none']).optional(),
  checklist: ChecklistSchema,
  clientContext: ClientContextSchema.optional(),
  // The deployed game version this verdict judges.
  gameVersion: z.string().trim().min(1).max(80).nullable().optional(),
});

function normalizeClientContext(raw: z.infer<typeof ClientContextSchema> | undefined): AssessmentClientContext | null {
  if (!raw) return null;
  return {
    viewportW: raw.viewportW,
    viewportH: raw.viewportH,
    screenW: raw.screenW,
    screenH: raw.screenH,
    dpr: raw.dpr,
    input: raw.input,
    platform: raw.platform,
    lang: raw.lang ?? null,
    ua: raw.ua ?? null,
  };
}

export function isReviewer(
  uid: string | undefined,
  reviewerUids: Set<string> | undefined,
  adminUids: Set<string> | undefined,
): boolean {
  if (!uid) return false;
  if (isAdmin(uid, adminUids)) return true;
  return reviewerUids !== undefined && reviewerUids.has(uid);
}

export function isReviewerSession(
  request: FastifyRequest,
  reviewerUids: Set<string> | undefined,
  adminUids: Set<string> | undefined,
): boolean {
  // Reviewer bots (e.g. bot:grok) authenticate via PAT only, REVIEWER_UIDS-gated.
  if (request.authMethod !== 'session' && request.authMethod !== 'token') return false;
  return isReviewer(request.user?.uid, reviewerUids, adminUids);
}

function titleFromSubmission(record: SubmissionRecord): string {
  const titled = record.title.trim();
  if (titled) return titled;
  return record.slug ?? `issue-${record.jobId}`;
}

export function isReviewableCreatorDraft(record: SubmissionRecord): boolean {
  return Boolean(
    record.slug && record.deliveredVersion && record.draftSharedAt && !record.publishedAt && !record.abandonedAt,
  );
}

function reviewerAudience(reviewerUids: Set<string>, adminUids: Set<string>): Set<string> {
  return new Set([...reviewerUids, ...adminUids]);
}

export async function registerReviewRoutes(app: FastifyInstance, options: ReviewRoutesOptions): Promise<void> {
  const { store } = options;
  const reviewerUids = options.reviewerUids ?? new Set<string>();
  const adminUids = options.adminUids ?? new Set<string>();
  const listCatalog = options.listCatalog ?? (async () => []);
  const now = options.now ?? Date.now;

  function refuseUnlessReviewer(
    request: FastifyRequest,
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  ) {
    if (!isReviewerSession(request, reviewerUids, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    return null;
  }

  async function collectPool(source: ReviewSweepSource): Promise<ReviewQueueItem[]> {
    const items: ReviewQueueItem[] = [];
    if (source === 'catalog' || source === 'all') {
      let catalog: ReviewCatalogEntry[];
      try {
        catalog = await listCatalog();
      } catch {
        catalog = [];
      }
      for (const entry of catalog) {
        items.push({
          slug: entry.slug,
          title: entry.title || entry.slug,
          source: 'catalog',
          creatorHandle: entry.creatorHandle,
          genre: entry.genre ?? null,
          jobId: null,
          media: entry.media ?? null,
        });
        if (items.length >= MAX_SWEEP_GAMES) return items;
      }
    }
    if ((source === 'creator' || source === 'all') && items.length < MAX_SWEEP_GAMES) {
      const delivered = await store.listSubmissionsWithDelivery();
      for (const record of delivered) {
        if (!isReviewableCreatorDraft(record)) continue;
        const slug = record.slug!;
        if (items.some((item) => item.slug === slug)) continue;
        let creatorHandle: string | null = null;
        try {
          creatorHandle = (await store.getUser(record.ownerUid))?.handle ?? null;
        } catch {
          // best-effort
        }
        items.push({
          slug,
          title: titleFromSubmission(record),
          source: 'creator',
          creatorHandle,
          genre: null,
          jobId: record.jobId,
          media: null,
        });
        if (items.length >= MAX_SWEEP_GAMES) break;
      }
    }
    return items;
  }

  interface ReviewPools {
    catalog: ReviewCatalogEntry[];
    delivered: SubmissionRecord[];
  }

  // Loaded once per request, not once per targeted slug.
  async function loadReviewPools(): Promise<ReviewPools> {
    let catalog: ReviewCatalogEntry[];
    try {
      catalog = await listCatalog();
    } catch {
      catalog = [];
    }
    const delivered = await store.listSubmissionsWithDelivery();
    return { catalog, delivered };
  }

  // Single-slug lookup for a targeted re-review, against already-loaded pools.
  async function findQueueItem(slug: string, pools: ReviewPools): Promise<ReviewQueueItem | null> {
    const entry = pools.catalog.find((row) => row.slug === slug);
    if (entry) {
      return {
        slug: entry.slug,
        title: entry.title || entry.slug,
        source: 'catalog',
        creatorHandle: entry.creatorHandle,
        genre: entry.genre ?? null,
        jobId: null,
        media: entry.media ?? null,
      };
    }
    const record = pools.delivered.find((row) => row.slug === slug && isReviewableCreatorDraft(row));
    if (!record) return null;
    let creatorHandle: string | null = null;
    try {
      creatorHandle = (await store.getUser(record.ownerUid))?.handle ?? null;
    } catch {
      // best-effort
    }
    return {
      slug,
      title: titleFromSubmission(record),
      source: 'creator',
      creatorHandle,
      genre: null,
      jobId: record.jobId,
      media: null,
    };
  }

  async function targetedQueueItems(
    reviewerUid: string,
    sourceFilter: 'catalog' | 'creator' | 'all',
  ): Promise<{
    items: ReviewQueueItem[];
    requests: ReReviewRequest[];
  }> {
    const requests = await store.listOpenReReviewRequestsForReviewer(reviewerUid);
    if (requests.length === 0) return { items: [], requests };
    const pools = await loadReviewPools();
    const items: ReviewQueueItem[] = [];
    for (const req of requests) {
      const item = await findQueueItem(req.slug, pools);
      if (!item) continue;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) continue;
      items.push({
        ...item,
        reReview: { reason: req.reason, gameVersion: req.gameVersion, requestedAt: req.createdAt },
      });
    }
    return { items, requests };
  }

  async function notifySweep(sweep: ReviewSweep, notificationId: string): Promise<number> {
    if (!options.emitDeps || !options.emitReviewSweep) return 0;
    const audience = reviewerAudience(reviewerUids, adminUids);
    if (audience.size === 0) return 0;
    const released = effectiveReleasedCount(sweep, now());
    const { created } = await options.emitReviewSweep(
      { ...options.emitDeps, reviewerUids: audience, now },
      {
        notificationId,
        title: `Review sweep · ${released} of ${sweep.slugs.length}`,
        detail: sweep.note ?? undefined,
      },
    );
    await store.updateReviewSweep(sweep.id, {
      notifiedAt: new Date(now()).toISOString(),
      notifiedCount: created,
      updatedAt: new Date(now()).toISOString(),
      updatedBy: sweep.updatedBy,
    });
    return created;
  }

  app.get('/api/review/queue', async (request, reply) => {
    const refused = refuseUnlessReviewer(request, reply);
    if (refused) return refused;

    const query = QueueQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.issues[0]?.message ?? 'invalid query' });
    }
    const sourceFilter = query.data.source ?? 'all';
    const uid = request.user!.uid;
    const mine = await store.listGameAssessmentsByReviewer(uid);
    const { items: targeted } = await targetedQueueItems(uid, sourceFilter);

    const open = await store.getOpenReviewSweep();
    if (!open || open.status === 'paused') {
      return {
        source: sourceFilter,
        remaining: targeted.length,
        assessed: mine.length,
        items: targeted,
        sweep: open
          ? {
              id: open.id,
              status: open.status,
              total: open.slugs.length,
              released: effectiveReleasedCount(open, now()),
            }
          : null,
        emptyReason: targeted.length > 0 ? null : open ? ('sweep_paused' as const) : ('no_active_sweep' as const),
      };
    }

    const done = new Set(mine.map((row) => row.slug));
    const unlocked = new Set(releasedSlugs(open, now()));
    const pool = await collectPool(open.source);
    const bySlug = new Map(pool.map((item) => [item.slug, item]));

    const items: ReviewQueueItem[] = [];
    const seen = new Set<string>();
    for (const slug of open.slugs) {
      if (!unlocked.has(slug) || done.has(slug)) continue;
      const item = bySlug.get(slug);
      if (!item) continue;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) continue;
      items.push(item);
      seen.add(slug);
      if (items.length >= MAX_QUEUE) break;
    }
    // Targeted slugs surface even if already assessed or outside the pool.
    for (const item of targeted) {
      if (seen.has(item.slug) || items.length >= MAX_QUEUE) continue;
      items.push(item);
      seen.add(item.slug);
    }

    return {
      source: sourceFilter,
      remaining: items.length,
      assessed: mine.length,
      items,
      sweep: {
        id: open.id,
        status: open.status,
        total: open.slugs.length,
        released: effectiveReleasedCount(open, now()),
      },
      emptyReason: items.length === 0 ? ('queue_clear' as const) : null,
    };
  });

  // Lightweight badge feed for the hamburger Review link.
  app.get('/api/review/status', async (request, reply) => {
    const refused = refuseUnlessReviewer(request, reply);
    if (refused) return refused;
    const uid = request.user!.uid;
    const { items: targeted } = await targetedQueueItems(uid, 'all');
    const targetedSlugs = new Set(targeted.map((item) => item.slug));
    const open = await store.getOpenReviewSweep();
    if (!open || open.status !== 'active') {
      return {
        remaining: targetedSlugs.size,
        sweep: open
          ? {
              id: open.id,
              status: open.status,
              total: open.slugs.length,
              released: effectiveReleasedCount(open, now()),
            }
          : null,
      };
    }
    const mine = await store.listGameAssessmentsByReviewer(uid);
    const done = new Set(mine.map((row) => row.slug));
    const unlocked = releasedSlugs(open, now());
    const sweepRemaining = unlocked.filter((slug) => !done.has(slug) && !targetedSlugs.has(slug)).length;
    return {
      remaining: sweepRemaining + targetedSlugs.size,
      sweep: {
        id: open.id,
        status: open.status,
        total: open.slugs.length,
        released: unlocked.length,
      },
    };
  });

  app.get('/api/review/assessments/mine', async (request, reply) => {
    const refused = refuseUnlessReviewer(request, reply);
    if (refused) return refused;
    const rows = await store.listGameAssessmentsByReviewer(request.user!.uid);
    return { assessments: rows };
  });

  app.post('/api/review/assessments', async (request, reply) => {
    const refused = refuseUnlessReviewer(request, reply);
    if (refused) return refused;

    const body = AssessmentBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const rawNote = body.data.note.trim();
    const sanitized = sanitizeCreatorText(rawNote, { singleLine: false }).slice(0, MAX_NOTE);
    if (!sanitized) {
      return reply.status(400).send({ error: 'note is required' });
    }

    const checklist: AssessmentChecklist = body.data.checklist;
    if (!isAssessmentChecklist(checklist)) {
      return reply.status(400).send({ error: 'checklist is incomplete' });
    }
    // Guard new axes if Zod schema drifts.
    for (const key of ASSESSMENT_CHECKLIST_KEYS) {
      if (!checklist[key]) {
        return reply.status(400).send({ error: `checklist.${key} is required` });
      }
    }

    const noteOrigin: AssessmentNoteOrigin = body.data.noteOrigin === 'speech' ? 'speech' : 'text';
    const verdict: AssessmentVerdict = body.data.verdict;
    const source: AssessmentSource = body.data.source;
    const title = body.data.title?.trim() || body.data.slug;
    const creatorHandle = body.data.creatorHandle === undefined ? null : body.data.creatorHandle;
    const reviewerUid = request.user!.uid;

    // New rows need a released slug or an open re-review request.
    const prior = await store.getGameAssessment(body.data.slug, reviewerUid);
    const reReviewRequest = await store.getReReviewRequest(body.data.slug, reviewerUid);
    const targeted = reReviewRequest?.status === 'open';
    if (!prior && !targeted) {
      const open = await store.getOpenReviewSweep();
      if (!open || open.status !== 'active') {
        return reply.status(409).send({ error: 'no_active_sweep' });
      }
      if (!releasedSlugs(open, now()).includes(body.data.slug)) {
        return reply.status(409).send({ error: 'slug_not_in_sweep' });
      }
    }

    const gameVersion =
      body.data.gameVersion === undefined ? (reReviewRequest?.gameVersion ?? null) : body.data.gameVersion;

    const assessment: GameAssessment = await store.upsertGameAssessment({
      slug: body.data.slug,
      title,
      source,
      creatorHandle,
      reviewerUid,
      verdict,
      note: sanitized,
      noteOrigin,
      checklist,
      clientContext: normalizeClientContext(body.data.clientContext),
      gameVersion,
    });

    if (targeted) {
      await store.resolveReReviewRequest(body.data.slug, reviewerUid);
    }

    return { assessment };
  });

  app.get('/api/admin/assessments', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const query = parseAssessmentPageQuery(request.query);
    if (!query) return reply.status(400).send({ error: 'invalid query' });

    const rows = await store.listGameAssessments();
    const byGame = new Map<
      string,
      {
        slug: string;
        title: string;
        keep: number;
        cut: number;
        skip: number;
        notes: number;
        resolved: number;
        open: number;
      }
    >();
    for (const row of rows) {
      const current = byGame.get(row.slug) ?? {
        slug: row.slug,
        title: row.title,
        keep: 0,
        cut: 0,
        skip: 0,
        notes: 0,
        resolved: 0,
        open: 0,
      };
      current[row.verdict] += 1;
      if (row.note) current.notes += 1;
      if (row.resolution) current.resolved += 1;
      else current.open += 1;
      if (row.title && row.title !== row.slug) current.title = row.title;
      byGame.set(row.slug, current);
    }

    const games = [...byGame.values()].sort((a, b) => b.cut - a.cut || b.keep - a.keep || a.slug.localeCompare(b.slug));
    // Filter narrows detailed rows only; totals stay whole.
    const matched = rows.filter((row) => matchesResolutionFilter(row, query.resolution));

    return {
      total: rows.length,
      games,
      ...summarizeResolutions(rows),
      resolution: query.resolution,
      matched: matched.length,
      ...paginateAssessments(matched, query),
    };
  });

  await registerAssessmentResolutionRoute(app, { store, adminUids, now });

  const CreateSweepSchema = z.object({
    source: z.enum(REVIEW_SWEEP_SOURCES).default('catalog'),
    maxGames: z.number().int().min(1).max(MAX_SWEEP_GAMES).default(40),
    releasePerDay: z.number().int().min(1).max(MAX_RELEASE_PER_DAY).nullable().optional(),
    note: z.string().trim().max(280).nullable().optional(),
    notify: z.boolean().optional(),
  });

  const PatchSweepSchema = z
    .object({
      status: z.enum(REVIEW_SWEEP_STATUSES).optional(),
      releaseMore: z.number().int().min(1).max(MAX_SWEEP_GAMES).optional(),
      releaseAll: z.boolean().optional(),
      releasePerDay: z.number().int().min(1).max(MAX_RELEASE_PER_DAY).nullable().optional(),
      notify: z.boolean().optional(),
      note: z.string().trim().max(280).nullable().optional(),
    })
    .refine(
      (patch) =>
        patch.status !== undefined ||
        patch.releaseMore !== undefined ||
        patch.releaseAll !== undefined ||
        patch.releasePerDay !== undefined ||
        patch.notify !== undefined ||
        patch.note !== undefined,
      'nothing to change',
    );

  app.get('/api/admin/review-sweeps', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const [open, recent, allAssessments] = await Promise.all([
      store.getOpenReviewSweep(),
      store.listReviewSweeps({ limit: 20 }),
      store.listGameAssessments(),
    ]);
    const assessedSlugs = new Set(allAssessments.map((row) => row.slug));
    const nowMs = now();
    const openView = open
      ? {
          ...open,
          progress: summarizeSweepProgress(open, assessedSlugs, nowMs),
          slugsPreview: open.slugs.slice(0, 40),
        }
      : null;
    return {
      open: openView,
      recent: recent.map((sweep) => ({
        id: sweep.id,
        status: sweep.status,
        source: sweep.source,
        total: sweep.slugs.length,
        released: effectiveReleasedCount(sweep, nowMs),
        createdAt: sweep.createdAt,
        createdBy: sweep.createdBy,
        notifiedAt: sweep.notifiedAt,
        notifiedCount: sweep.notifiedCount,
        releasePerDay: sweep.releasePerDay,
        note: sweep.note,
      })),
      reviewerCount: reviewerAudience(reviewerUids, adminUids).size,
    };
  });

  app.post('/api/admin/review-sweeps', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const body = CreateSweepSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const pool = await collectPool(body.data.source);
    // Prefer unjudged games when re-sweeping.
    const assessed = new Set((await store.listGameAssessments()).map((row) => row.slug));
    const fresh = pool.filter((item) => !assessed.has(item.slug));
    const chosen = (fresh.length > 0 ? fresh : pool).slice(0, body.data.maxGames);
    if (chosen.length === 0) {
      return reply.status(400).send({ error: 'no games available for a sweep in that source' });
    }

    const createdAt = new Date(now()).toISOString();
    const releasePerDay = body.data.releasePerDay === undefined ? null : body.data.releasePerDay;
    const releasedCount = releasePerDay == null ? chosen.length : Math.min(chosen.length, releasePerDay);
    const sweep = await store.createReviewSweep({
      id: mintReviewSweepId(now()),
      status: 'active',
      source: body.data.source,
      slugs: chosen.map((item) => item.slug),
      releasedCount,
      releasePerDay,
      startedAt: createdAt,
      note: body.data.note ?? null,
      createdAt,
      createdBy: request.user!.uid,
      updatedAt: createdAt,
      updatedBy: request.user!.uid,
      notifiedAt: null,
      notifiedCount: 0,
    });

    let notified = 0;
    if (body.data.notify !== false) {
      notified = await notifySweep(sweep, `review-sweep-${sweep.id}`);
    }

    return {
      sweep: {
        ...sweep,
        progress: summarizeSweepProgress(sweep, assessed, now()),
      },
      notified,
    };
  });

  app.post('/api/admin/review-sweeps/:id', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const id = (request.params as { id?: string }).id?.trim();
    if (!id) return reply.status(400).send({ error: 'missing id' });
    const body = PatchSweepSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const existing = await store.getReviewSweep(id);
    if (!existing) return reply.status(404).send({ error: 'not found' });

    const patch: Parameters<Store['updateReviewSweep']>[1] = {
      updatedAt: new Date(now()).toISOString(),
      updatedBy: request.user!.uid,
    };
    if (body.data.status !== undefined) patch.status = body.data.status;
    if (body.data.note !== undefined) patch.note = body.data.note;
    if (body.data.releasePerDay !== undefined) patch.releasePerDay = body.data.releasePerDay;

    const currentReleased = effectiveReleasedCount(existing, now());
    if (body.data.releaseAll) {
      patch.releasedCount = existing.slugs.length;
    } else if (body.data.releaseMore !== undefined) {
      patch.releasedCount = Math.min(existing.slugs.length, currentReleased + body.data.releaseMore);
    }

    // Snapshot drip floor so pause keeps unlocked games.
    if (body.data.status === 'paused' && existing.status === 'active') {
      patch.releasedCount = patch.releasedCount ?? currentReleased;
    }

    // Re-anchor drip on resume so pause does not backlog.
    if (body.data.status === 'active' && existing.status === 'paused') {
      patch.startedAt = new Date(now()).toISOString();
      patch.releasedCount = patch.releasedCount ?? currentReleased;
    }

    const updated = await store.updateReviewSweep(id, patch);
    if (!updated) return reply.status(404).send({ error: 'not found' });

    let notified = 0;
    if (body.data.notify) {
      const released = effectiveReleasedCount(updated, now());
      notified = await notifySweep(updated, `review-sweep-${updated.id}-r${released}`);
    }

    const assessed = new Set((await store.listGameAssessments()).map((row) => row.slug));
    return {
      sweep: {
        ...updated,
        progress: summarizeSweepProgress(updated, assessed, now()),
        slugsPreview: updated.slugs.slice(0, 40),
      },
      notified,
    };
  });

  // Superseded rows a plain re-edit would otherwise overwrite silently.
  const HistoryQuerySchema = z.object({
    slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
    reviewerUid: z.string().trim().min(1).max(120),
  });

  app.get('/api/admin/assessments/history', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const query = HistoryQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.issues[0]?.message ?? 'invalid query' });
    }
    const [current, history] = await Promise.all([
      store.getGameAssessment(query.data.slug, query.data.reviewerUid),
      store.listGameAssessmentHistory(query.data.slug, query.data.reviewerUid),
    ]);
    return { current, history };
  });

  const RequeueSchema = z.object({
    slugs: z.array(z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug')).min(1).max(MAX_REQUEUE_SLUGS),
    reviewerUids: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_REQUEUE_REVIEWERS),
    // Deployed version the requeued fix is expected to be judged against; informational.
    gameVersion: z.string().trim().min(1).max(80).nullable().optional(),
    reason: z.string().trim().max(280).nullable().optional(),
    notify: z.boolean().optional(),
  });

  // Explicit slugs x explicit reviewers, outside any sweep.
  app.post('/api/admin/review-requeue', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const body = RequeueSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'invalid request' });
    }

    const pairCount = body.data.slugs.length * body.data.reviewerUids.length;
    if (pairCount > MAX_REQUEUE_PAIRS) {
      return reply.status(400).send({ error: `too many slug × reviewer pairs (max ${MAX_REQUEUE_PAIRS})` });
    }

    const audience = reviewerAudience(reviewerUids, adminUids);
    const unknownReviewer = body.data.reviewerUids.find((uid) => !audience.has(uid));
    if (unknownReviewer) {
      return reply.status(400).send({ error: `${unknownReviewer} is not a reviewer` });
    }

    // Refuse a phantom request the reviewer could never see or resolve.
    const pools = await loadReviewPools();
    for (const slug of body.data.slugs) {
      if (!(await findQueueItem(slug, pools))) {
        return reply.status(400).send({ error: `${slug} is not a published or reviewable slug` });
      }
    }

    const gameVersion = body.data.gameVersion ?? null;
    const reason = body.data.reason ?? null;
    const createdBy = request.user!.uid;
    const requests = body.data.slugs.flatMap((slug) =>
      body.data.reviewerUids.map((reviewerUid) => ({ slug, reviewerUid, gameVersion, reason, createdBy })),
    );
    const created = await store.upsertReReviewRequests(requests);

    let notified = 0;
    if (body.data.notify !== false && options.emitDeps && options.emitReviewSweep) {
      const targetedReviewers = new Set(body.data.reviewerUids);
      const { created: n } = await options.emitReviewSweep(
        { ...options.emitDeps, reviewerUids: targetedReviewers, now },
        {
          notificationId: `review-requeue-${now().toString(36)}`,
          title: `Targeted re-review · ${body.data.slugs.length} game${body.data.slugs.length === 1 ? '' : 's'}`,
          detail: reason ?? undefined,
        },
      );
      notified = n;
    }

    return { requests: created, notified };
  });

  app.get('/api/admin/review-requeue', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    const requests = await store.listReReviewRequests({ limit: MAX_ADMIN_ROWS });
    return { requests };
  });
}
