import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isAdmin, isAdminSession } from './admin.js';
import type { ContentChecker } from './moderation.js';
import { logModerationRejection } from './moderation-metrics.js';
import { sanitizeCreatorText } from './submission-status.js';
import type {
  AssessmentNoteOrigin,
  AssessmentSource,
  AssessmentVerdict,
  GameAssessment,
  Store,
  SubmissionRecord,
} from './store.js';

/**
 * Reviewer assessment desk (docs/game-assessment-plan.md).
 *
 * A trusted colleague walks the catalog (and shared creator drafts), swipes keep/cut,
 * and leaves a short reason — typed or spoken. Role is an env allowlist
 * (`REVIEWER_UIDS`), unioned with `ADMIN_UIDS`. Session-only, 404-to-everyone-else —
 * same posture as the operator console.
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_NOTE = 2000;
const MAX_ADMIN_ROWS = 200;
const MAX_QUEUE = 500;

export interface ReviewCatalogEntry {
  slug: string;
  title: string;
  creatorHandle: string | null;
  genre?: string | null;
}

export interface ReviewQueueItem {
  slug: string;
  title: string;
  source: AssessmentSource;
  creatorHandle: string | null;
  genre: string | null;
  /** Present for creator-source items that are still unpublished. */
  issueNumber: number | null;
}

export interface ReviewRoutesOptions {
  store: Store;
  /** Uids in REVIEWER_UIDS. Empty means nobody is a reviewer unless they are admin. */
  reviewerUids?: Set<string>;
  /** Uids in ADMIN_UIDS — admins are reviewers too. */
  adminUids?: Set<string>;
  contentChecker: ContentChecker;
  /**
   * Published catalog. Absent/empty means the catalog queue is empty (local dev
   * without games-repo wiring answers this way rather than 503-ing the desk).
   */
  listCatalog?: () => Promise<ReviewCatalogEntry[]>;
  now?: () => number;
}

const QueueQuerySchema = z.object({
  source: z.enum(['catalog', 'creator', 'all']).optional(),
});

const AssessmentBodySchema = z.object({
  slug: z.string().trim().min(1).max(80).regex(SLUG_PATTERN, 'invalid slug'),
  source: z.enum(['catalog', 'creator']),
  title: z.string().trim().min(1).max(120).optional(),
  creatorHandle: z.string().trim().min(1).max(40).nullable().optional(),
  verdict: z.enum(['keep', 'cut', 'skip']),
  note: z.string().max(MAX_NOTE).optional(),
  noteOrigin: z.enum(['text', 'speech', 'none']).optional(),
});

export function isReviewer(
  uid: string | undefined,
  reviewerUids: Set<string> | undefined,
  adminUids: Set<string> | undefined,
): boolean {
  if (!uid) return false;
  if (isAdmin(uid, adminUids)) return true;
  return reviewerUids !== undefined && reviewerUids.has(uid);
}

/** Browser session ∩ reviewer allowlist. PATs never count — same rule as operators. */
export function isReviewerSession(
  request: FastifyRequest,
  reviewerUids: Set<string> | undefined,
  adminUids: Set<string> | undefined,
): boolean {
  return request.authMethod === 'session' && isReviewer(request.user?.uid, reviewerUids, adminUids);
}

function titleFromSubmission(record: SubmissionRecord): string {
  return record.slug ?? `issue-${record.issueNumber}`;
}

/** Shared, delivered, not yet published — the creator half of the desk. */
export function isReviewableCreatorDraft(record: SubmissionRecord): boolean {
  return Boolean(
    record.slug && record.deliveredVersion && record.draftSharedAt && !record.publishedAt && !record.abandonedAt,
  );
}

export async function registerReviewRoutes(app: FastifyInstance, options: ReviewRoutesOptions): Promise<void> {
  const { store, contentChecker } = options;
  const reviewerUids = options.reviewerUids ?? new Set<string>();
  const adminUids = options.adminUids ?? new Set<string>();
  const listCatalog = options.listCatalog ?? (async () => []);

  function refuseUnlessReviewer(
    request: FastifyRequest,
    reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  ) {
    if (!isReviewerSession(request, reviewerUids, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }
    return null;
  }

  app.get('/api/review/queue', async (request, reply) => {
    const refused = refuseUnlessReviewer(request, reply);
    if (refused) return refused;

    const query = QueueQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.issues[0]?.message ?? 'invalid query' });
    }
    const source = query.data.source ?? 'all';
    const uid = request.user!.uid;

    const mine = await store.listGameAssessmentsByReviewer(uid);
    const done = new Set(mine.map((row) => row.slug));

    const items: ReviewQueueItem[] = [];

    if (source === 'catalog' || source === 'all') {
      let catalog: ReviewCatalogEntry[] = [];
      try {
        catalog = await listCatalog();
      } catch (err) {
        request.log.warn({ err }, 'review queue: catalog unavailable');
      }
      for (const entry of catalog) {
        if (done.has(entry.slug)) continue;
        items.push({
          slug: entry.slug,
          title: entry.title || entry.slug,
          source: 'catalog',
          creatorHandle: entry.creatorHandle,
          genre: entry.genre ?? null,
          issueNumber: null,
        });
        if (items.length >= MAX_QUEUE) break;
      }
    }

    if ((source === 'creator' || source === 'all') && items.length < MAX_QUEUE) {
      const delivered = await store.listSubmissionsWithDelivery();
      for (const record of delivered) {
        if (!isReviewableCreatorDraft(record)) continue;
        const slug = record.slug!;
        if (done.has(slug)) continue;
        // A catalog hit for the same slug already queued it as published.
        if (items.some((item) => item.slug === slug)) continue;
        let creatorHandle: string | null = null;
        try {
          creatorHandle = (await store.getUser(record.ownerUid))?.handle ?? null;
        } catch {
          // Owner lookup is best-effort; the queue item is still useful without a handle.
        }
        items.push({
          slug,
          title: titleFromSubmission(record),
          source: 'creator',
          creatorHandle,
          genre: null,
          issueNumber: record.issueNumber,
        });
        if (items.length >= MAX_QUEUE) break;
      }
    }

    return {
      source,
      remaining: items.length,
      assessed: mine.length,
      items,
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

    const rawNote = (body.data.note ?? '').trim();
    let note = '';
    let noteOrigin: AssessmentNoteOrigin = body.data.noteOrigin ?? (rawNote ? 'text' : 'none');
    if (rawNote) {
      const sanitized = sanitizeCreatorText(rawNote, { singleLine: false }).slice(0, MAX_NOTE);
      if (!sanitized) {
        return reply.status(400).send({ error: 'note is empty after sanitization' });
      }
      const fieldsToModerate = sanitized === rawNote ? [rawNote] : [rawNote, sanitized];
      const moderation = await contentChecker.checkFields(fieldsToModerate);
      if (!moderation.allowed) {
        logModerationRejection(request.log, {
          surface: 'review_assessment',
          uid: request.user!.uid,
          category: moderation.category,
        });
        return reply.status(422).send({ error: 'content_rejected', category: moderation.category ?? 'other' });
      }
      note = sanitized;
      if (noteOrigin === 'none') noteOrigin = 'text';
    } else {
      noteOrigin = 'none';
    }

    const verdict: AssessmentVerdict = body.data.verdict;
    const source: AssessmentSource = body.data.source;
    const title = body.data.title?.trim() || body.data.slug;
    const creatorHandle = body.data.creatorHandle === undefined ? null : body.data.creatorHandle;

    const assessment: GameAssessment = await store.upsertGameAssessment({
      slug: body.data.slug,
      title,
      source,
      creatorHandle,
      reviewerUid: request.user!.uid,
      verdict,
      note,
      noteOrigin,
    });

    return { assessment };
  });

  /**
   * Operator summary — admins only (stricter than reviewer). Lives under /api/admin so
   * the console's existing auth story covers it; registered here so the aggregate logic
   * sits next to the write path.
   */
  app.get('/api/admin/assessments', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) {
      return reply.status(404).send({ error: 'not found' });
    }

    const rows = await store.listGameAssessments({ limit: MAX_ADMIN_ROWS });
    const byGame = new Map<
      string,
      { slug: string; title: string; keep: number; cut: number; skip: number; notes: number }
    >();
    for (const row of rows) {
      const current = byGame.get(row.slug) ?? {
        slug: row.slug,
        title: row.title,
        keep: 0,
        cut: 0,
        skip: 0,
        notes: 0,
      };
      current[row.verdict] += 1;
      if (row.note) current.notes += 1;
      if (row.title && row.title !== row.slug) current.title = row.title;
      byGame.set(row.slug, current);
    }

    const games = [...byGame.values()].sort((a, b) => b.cut - a.cut || b.keep - a.keep || a.slug.localeCompare(b.slug));

    return {
      total: rows.length,
      games,
      recent: rows.slice(0, 40),
    };
  });
}
