// Reviewer queue reads, one window each. See docs/firestore-read-cost.md.

import type { AssessmentSource, ReviewSweepSource } from '@gamedevpl/contract';
import { rememberBounded } from '../platform/bounded-map.js';
import type { ReviewSweep, Store, SubmissionRecord } from '../platform/store.js';
import { MAX_SWEEP_GAMES } from './review-sweep.js';

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

export interface ReviewQueueCacheDeps {
  store: Store;
  listCatalog: () => Promise<ReviewCatalogEntry[]>;
  now: () => number;
}

export interface ReviewPools {
  catalog: ReviewCatalogEntry[];
  delivered: SubmissionRecord[];
}

export interface ReviewQueueCache {
  loadReviewPools(opts?: { fresh?: boolean }): Promise<ReviewPools>;
  openReviewSweep(opts?: { fresh?: boolean }): Promise<ReviewSweep | null>;
  assessedSlugsFor(reviewerUid: string): Promise<Set<string>>;
  collectPool(source: ReviewSweepSource, opts?: { fresh?: boolean }): Promise<ReviewQueueItem[]>;
  findQueueItem(slug: string, pools: ReviewPools): Promise<ReviewQueueItem | null>;
  targetedQueueItems(
    reviewerUid: string,
    sourceFilter: 'catalog' | 'creator' | 'all',
  ): Promise<{ items: ReviewQueueItem[] }>;
  invalidateOpenSweep(): void;
  invalidateReviewer(reviewerUid: string): void;
}

export function createReviewQueueCache(deps: ReviewQueueCacheDeps): ReviewQueueCache {
  const { store, listCatalog, now } = deps;

  // Wider than the badge's two-minute poll, or nothing hits.
  const BADGE_WINDOW_MS = 10 * 60_000;

  // LRU-capped: a key never revisited must not grow with sign-ins.
  const MAX_CACHED_REVIEWERS = 200;

  interface Windowed<T> {
    expiresAt: number;
    value: T;
  }

  function fresh<T>(entry: Windowed<T> | undefined): entry is Windowed<T> {
    return entry !== undefined && entry.expiresAt > now();
  }

  let poolsCache: Windowed<ReviewPools> | null = null;
  // Keyed by uid: never answer one reviewer with another's queue.
  const assessedCache = new Map<string, Windowed<Set<string>>>();
  const targetedCache = new Map<string, Windowed<ReviewQueueItem[]>>();
  let openSweepCache: Windowed<ReviewSweep | null> | null = null;
  // Same window as the badge: no new staleness bound to reason about.
  const handleCache = new Map<string, Windowed<string | null>>();
  const MAX_CACHED_HANDLES = 500;

  // Bumped by each invalidation, so a read cannot seal in staleness.
  let generation = 0;

  function invalidateOpenSweep(): void {
    openSweepCache = null;
    generation += 1;
  }

  function invalidateReviewer(reviewerUid: string): void {
    assessedCache.delete(reviewerUid);
    targetedCache.delete(reviewerUid);
    generation += 1;
  }

  // Once per window, not per request, and never per targeted slug.
  async function loadReviewPools(opts?: { fresh?: boolean }): Promise<ReviewPools> {
    if (!opts?.fresh && poolsCache && poolsCache.expiresAt > now()) return poolsCache.value;
    let catalog: ReviewCatalogEntry[];
    try {
      catalog = await listCatalog();
    } catch {
      catalog = [];
    }
    const delivered = await store.listSubmissionsWithDelivery();
    const value = { catalog, delivered };
    poolsCache = { value, expiresAt: now() + BADGE_WINDOW_MS };
    return value;
  }

  async function openReviewSweep(opts?: { fresh?: boolean }): Promise<ReviewSweep | null> {
    if (!opts?.fresh && fresh(openSweepCache ?? undefined)) return openSweepCache!.value;
    const at = generation;
    const value = await store.getOpenReviewSweep();
    // A write landed mid-read, so this answer is already stale.
    if (generation !== at) return value;
    openSweepCache = { value, expiresAt: now() + BADGE_WINDOW_MS };
    return value;
  }

  async function assessedSlugsFor(reviewerUid: string): Promise<Set<string>> {
    const hit = assessedCache.get(reviewerUid);
    if (fresh(hit)) return hit.value;
    const at = generation;
    const rows = await store.listGameAssessmentsByReviewer(reviewerUid);
    const slugs = new Set(rows.map((row) => row.slug));
    if (generation !== at) return slugs;
    rememberBounded(
      assessedCache,
      reviewerUid,
      { value: slugs, expiresAt: now() + BADGE_WINDOW_MS },
      MAX_CACHED_REVIEWERS,
    );
    return slugs;
  }

  async function creatorHandle(ownerUid: string): Promise<string | null> {
    const hit = handleCache.get(ownerUid);
    if (fresh(hit)) return hit.value;
    let handle: string | null;
    try {
      handle = (await store.getUser(ownerUid))?.handle ?? null;
    } catch {
      return null;
    }
    rememberBounded(handleCache, ownerUid, { value: handle, expiresAt: now() + BADGE_WINDOW_MS }, MAX_CACHED_HANDLES);
    return handle;
  }

  // One round trip per distinct creator, not one per queued draft.
  async function creatorHandles(ownerUids: string[]): Promise<Map<string, string | null>> {
    const distinct = [...new Set(ownerUids)];
    const resolved = await Promise.all(distinct.map(async (uid) => [uid, await creatorHandle(uid)] as const));
    return new Map(resolved);
  }

  async function collectPool(source: ReviewSweepSource, opts?: { fresh?: boolean }): Promise<ReviewQueueItem[]> {
    const pools = await loadReviewPools(opts);
    const items: ReviewQueueItem[] = [];
    if (source === 'catalog' || source === 'all') {
      for (const entry of pools.catalog) {
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
      const seen = new Set(items.map((item) => item.slug));
      const drafts: SubmissionRecord[] = [];
      for (const record of pools.delivered) {
        if (!isReviewableCreatorDraft(record)) continue;
        const slug = record.slug!;
        if (seen.has(slug)) continue;
        seen.add(slug);
        drafts.push(record);
        if (items.length + drafts.length >= MAX_SWEEP_GAMES) break;
      }
      const handles = await creatorHandles(drafts.map((record) => record.ownerUid));
      for (const record of drafts) {
        items.push({
          slug: record.slug!,
          title: titleFromSubmission(record),
          source: 'creator',
          creatorHandle: handles.get(record.ownerUid) ?? null,
          genre: null,
          jobId: record.jobId,
          media: null,
        });
      }
    }
    return items;
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
    return {
      slug,
      title: titleFromSubmission(record),
      source: 'creator',
      creatorHandle: await creatorHandle(record.ownerUid),
      genre: null,
      jobId: record.jobId,
      media: null,
    };
  }

  // One window serves the badge and a source-filtered queue page alike.
  async function targetedQueueItems(
    reviewerUid: string,
    sourceFilter: 'catalog' | 'creator' | 'all',
  ): Promise<{ items: ReviewQueueItem[] }> {
    const hit = targetedCache.get(reviewerUid);
    const all = fresh(hit) ? hit.value : await loadTargetedQueueItems(reviewerUid);
    return { items: sourceFilter === 'all' ? all : all.filter((item) => item.source === sourceFilter) };
  }

  async function loadTargetedQueueItems(reviewerUid: string): Promise<ReviewQueueItem[]> {
    const at = generation;
    const requests = await store.listOpenReReviewRequestsForReviewer(reviewerUid);
    const items: ReviewQueueItem[] = [];
    if (requests.length > 0) {
      const pools = await loadReviewPools();
      for (const req of requests) {
        const item = await findQueueItem(req.slug, pools);
        if (!item) continue;
        items.push({
          ...item,
          reReview: { reason: req.reason, gameVersion: req.gameVersion, requestedAt: req.createdAt },
        });
      }
    }
    if (generation !== at) return items;
    rememberBounded(
      targetedCache,
      reviewerUid,
      { value: items, expiresAt: now() + BADGE_WINDOW_MS },
      MAX_CACHED_REVIEWERS,
    );
    return items;
  }

  return {
    loadReviewPools,
    openReviewSweep,
    assessedSlugsFor,
    collectPool,
    findQueueItem,
    targetedQueueItems,
    invalidateOpenSweep,
    invalidateReviewer,
  };
}
