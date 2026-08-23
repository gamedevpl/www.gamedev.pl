import type { Firestore } from '@google-cloud/firestore';
import { REVIEW_SWEEPS_COLLECTION, type ReviewSweep, type Scorecard } from '../records/review.js';

/**
 * Presentation order for scorecards: newest computation first, slug as the tie-break.
 *
 * The tie-break is the load-bearing half, not a nicety. A sweep stamps **one**
 * `computedAt` onto every game it writes, so equal timestamps are not an edge case —
 * they are every row. Ordering on the timestamp alone leaves the result order undefined
 * (Firestore guarantees nothing among equal values), which would make the operator table
 * reshuffle between reads and, past the read limit, change *which* games appear at all.
 *
 * Shared by both stores so the in-memory one used by tests cannot quietly disagree with
 * the Firestore one used in production — that divergence is what makes an ordering bug
 * invisible until it is in front of a person.
 */
export function compareScorecards(a: Scorecard, b: Scorecard): number {
  return b.computedAt.localeCompare(a.computedAt) || a.slug.localeCompare(b.slug);
}

export interface ReviewSweepStore {
  getOpenReviewSweep(): Promise<ReviewSweep | null>;

  getReviewSweep(id: string): Promise<ReviewSweep | null>;

  listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]>;

  createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep>;

  updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null>;

  /** Overwrites a game's current scorecard (docs/improvement-loop-plan.md IL-2). */
  putScorecard(slug: string, scorecard: Scorecard): Promise<void>;

  /** A game's current scorecard, or null before the first sweep has run for it. */
  getScorecard(slug: string): Promise<Scorecard | null>;

  /**
   * Every game's current scorecard, newest computation first.
   *
   * Exists so the sweep's output is *readable*. Writing an aggregate nobody can look at
   * is the same shape of mistake as a silently-dropping branch: the first sign it had
   * been producing nonsense would be an agent acting on the nonsense. Bounded, because
   * this is one query behind an operator page rather than a paginated surface.
   */
  listScorecards(opts?: { limit?: number }): Promise<Scorecard[]>;
}

export class InMemoryReviewSweepStore implements ReviewSweepStore {
  private reviewSweeps = new Map<string, ReviewSweep>();
  // Not private -- PublicationStore.listGameSlugs reaches across this (documented exception, see PR).
  scorecards = new Map<string, Scorecard>(); // slug -> current scorecard

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    const open = Array.from(this.reviewSweeps.values()).filter(
      (row) => row.status === 'active' || row.status === 'paused',
    );
    open.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return open[0] ? { ...open[0], slugs: [...open[0].slugs] } : null;
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    const row = this.reviewSweeps.get(id);
    return row ? { ...row, slugs: [...row.slugs] } : null;
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    const limit = opts?.limit ?? 20;
    return Array.from(this.reviewSweeps.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((row) => ({ ...row, slugs: [...row.slugs] }));
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    for (const [id, row] of this.reviewSweeps) {
      if (row.status === 'active' || row.status === 'paused') {
        this.reviewSweeps.set(id, {
          ...row,
          status: 'cancelled',
          updatedAt: sweep.createdAt,
          updatedBy: sweep.createdBy,
        });
      }
    }
    const record: ReviewSweep = { ...sweep, slugs: [...sweep.slugs] };
    this.reviewSweeps.set(record.id, record);
    return { ...record, slugs: [...record.slugs] };
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    const existing = this.reviewSweeps.get(id);
    if (!existing) return null;
    const record: ReviewSweep = { ...existing, ...patch, id: existing.id, slugs: [...existing.slugs] };
    this.reviewSweeps.set(id, record);
    return { ...record, slugs: [...record.slugs] };
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    this.scorecards.set(slug, structuredClone(scorecard));
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const found = this.scorecards.get(slug);
    return found ? structuredClone(found) : null;
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    return [...this.scorecards.values()]
      .map((card) => structuredClone(card))
      .sort(compareScorecards)
      .slice(0, opts?.limit ?? 200);
  }
}

export class FirestoreReviewSweepStore implements ReviewSweepStore {
  constructor(private db: Firestore) {}

  private reviewSweepsCollection() {
    return this.db.collection(REVIEW_SWEEPS_COLLECTION);
  }

  private hydrateReviewSweep(id: string, data: Omit<ReviewSweep, 'id'>): ReviewSweep {
    return {
      ...data,
      id,
      slugs: Array.isArray(data.slugs) ? data.slugs.filter((s): s is string => typeof s === 'string') : [],
      note: data.note ?? null,
      releasePerDay: data.releasePerDay ?? null,
      notifiedAt: data.notifiedAt ?? null,
      notifiedCount: typeof data.notifiedCount === 'number' ? data.notifiedCount : 0,
    };
  }

  async getOpenReviewSweep(): Promise<ReviewSweep | null> {
    // Two equality queries avoid a composite index.
    const [active, paused] = await Promise.all([
      this.reviewSweepsCollection().where('status', '==', 'active').limit(5).get(),
      this.reviewSweepsCollection().where('status', '==', 'paused').limit(5).get(),
    ]);
    const rows = [...active.docs, ...paused.docs]
      .map((d) => this.hydrateReviewSweep(d.id, d.data() as Omit<ReviewSweep, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return rows[0] ?? null;
  }

  async getReviewSweep(id: string): Promise<ReviewSweep | null> {
    const snap = await this.reviewSweepsCollection().doc(id).get();
    if (!snap.exists) return null;
    return this.hydrateReviewSweep(id, snap.data() as Omit<ReviewSweep, 'id'>);
  }

  async listReviewSweeps(opts?: { limit?: number }): Promise<ReviewSweep[]> {
    const limit = opts?.limit ?? 20;
    const snap = await this.reviewSweepsCollection().orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => this.hydrateReviewSweep(d.id, d.data() as Omit<ReviewSweep, 'id'>));
  }

  async createReviewSweep(sweep: ReviewSweep): Promise<ReviewSweep> {
    const open = await this.getOpenReviewSweep();
    if (open) {
      await this.reviewSweepsCollection().doc(open.id).set(
        {
          status: 'cancelled',
          updatedAt: sweep.createdAt,
          updatedBy: sweep.createdBy,
        },
        { merge: true },
      );
    }
    const { id, ...body } = sweep;
    await this.reviewSweepsCollection().doc(id).set(body);
    return { ...sweep, slugs: [...sweep.slugs] };
  }

  async updateReviewSweep(
    id: string,
    patch: Partial<Omit<ReviewSweep, 'id' | 'createdAt' | 'createdBy' | 'slugs' | 'source'>>,
  ): Promise<ReviewSweep | null> {
    const ref = this.reviewSweepsCollection().doc(id);
    const existing = await ref.get();
    if (!existing.exists) return null;
    await ref.set(patch, { merge: true });
    const snap = await ref.get();
    return this.hydrateReviewSweep(id, snap.data() as Omit<ReviewSweep, 'id'>);
  }

  // `current` is a fixed doc id, so a game has exactly one scorecard and the sweep
  // overwrites rather than accumulating a history nobody reads.
  private scorecardRef(slug: string) {
    return this.db.collection('games').doc(slug).collection('scorecard').doc('current');
  }

  async putScorecard(slug: string, scorecard: Scorecard): Promise<void> {
    // `set` without merge: a scorecard is a whole snapshot, and merging would leave
    // fields from a previous window alive next to a newer one — a row that never
    // existed as a measurement.
    await this.scorecardRef(slug).set(scorecard);
  }

  async getScorecard(slug: string): Promise<Scorecard | null> {
    const snap = await this.scorecardRef(slug).get();
    return snap.exists ? (snap.data() as Scorecard) : null;
  }

  async listScorecards(opts?: { limit?: number }): Promise<Scorecard[]> {
    // A collection-group query over `scorecard` reads every game's `current` doc in one
    // round trip, instead of one read per catalog slug. Safe as a group name: nothing
    // else in the schema uses it, unlike the `events` collision that forced play
    // telemetry into its own group.
    //
    // Ordered by `computedAt` rather than by any metric, because the question this read
    // exists to answer is "did the sweep run, and how fresh is the freshest" — a stale
    // scorecard is the failure worth seeing first.
    //
    // The `orderBy` selects *which* docs the limit keeps (the freshest, if the catalog
    // ever outgrows it); the sort below decides the order they are presented in. Both
    // are needed: a sweep stamps one `computedAt` on every game it writes, so equal
    // timestamps are the normal case rather than a rare tie, and Firestore promises
    // nothing about order among equal values. Sorting here rather than adding
    // `.orderBy('slug')` avoids provisioning a composite index for a listing that is
    // already bounded to a couple of hundred rows.
    const snap = await this.db
      .collectionGroup('scorecard')
      .orderBy('computedAt', 'desc')
      .limit(opts?.limit ?? 200)
      .get();
    return snap.docs.map((doc) => doc.data() as Scorecard).sort(compareScorecards);
  }
}
