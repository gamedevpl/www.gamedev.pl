import type { Firestore } from '@google-cloud/firestore';
import type { AssessmentSource } from '@gamedevpl/contract';
import {
  GAME_ASSESSMENTS_COLLECTION,
  GAME_ASSESSMENT_HISTORY_COLLECTION,
  RE_REVIEW_REQUESTS_COLLECTION,
  gameAssessmentId,
  hydrateGameAssessment,
  reReviewRequestId,
  type AssessmentResolution,
  type GameAssessment,
  type GameAssessmentHistoryEntry,
  type ReReviewRequest,
  type ResolutionWriteResult,
} from '../records/review.js';

export interface ReviewStore {
  // Upsert reviewer verdict; second pass overwrites in place.
  upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment>;

  getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null>;

  // Records or withdraws the follow-up; expectedUpdatedAt pins the verdict.
  setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult>;

  // Every reviewer's row for one game.
  listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]>;

  listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]>;

  // Recent assessments across reviewers; bounded operator page.
  listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]>;

  listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]>;

  countGameAssessmentsByUid(uid: string): Promise<number>;

  deleteGameAssessmentsByUid(uid: string): Promise<number>;

  // Superseded rows for one reviewer's one game, newest first.
  listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]>;

  // Opens or re-opens one re-review request per (slug, reviewerUid) pair.
  upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]>;

  getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null>;

  listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]>;

  // Recent targeted requests across reviewers; bounded operator page.
  listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]>;

  resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null>;
}

export class InMemoryReviewStore implements ReviewStore {
  private gameAssessments = new Map<string, GameAssessment>();
  // gameAssessmentId -> superseded rows, oldest first.
  private gameAssessmentHistory = new Map<string, GameAssessmentHistoryEntry[]>();
  private reReviewRequests = new Map<string, ReReviewRequest>();

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    const id = gameAssessmentId(input.slug, input.reviewerUid);
    const existing = this.gameAssessments.get(id);
    const now = new Date().toISOString();
    if (existing) {
      const history = this.gameAssessmentHistory.get(id) ?? [];
      history.push({ ...existing, supersededAt: now });
      this.gameAssessmentHistory.set(id, history);
    }
    const record: GameAssessment = {
      id,
      slug: input.slug,
      title: input.title,
      source: input.source,
      creatorHandle: input.creatorHandle,
      reviewerUid: input.reviewerUid,
      verdict: input.verdict,
      note: input.note,
      noteOrigin: input.noteOrigin,
      checklist: input.checklist ?? null,
      clientContext: input.clientContext ?? null,
      gameVersion: input.gameVersion ?? null,
      // Fresh judgment: prior follow-up stays on the archived row.
      resolution: null,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    this.gameAssessments.set(id, record);
    return { ...record };
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    const id = gameAssessmentId(slug, reviewerUid);
    const existing = this.gameAssessments.get(id);
    if (!existing) return { status: 'not_found' };
    if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
      return { status: 'stale', assessment: hydrateGameAssessment(id, existing) };
    }
    const record: GameAssessment = { ...existing, resolution: resolution ? { ...resolution } : null };
    this.gameAssessments.set(id, record);
    return { status: 'ok', assessment: hydrateGameAssessment(id, record) };
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.slug === slug)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.reviewerUid.localeCompare(b.reviewerUid))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    const id = gameAssessmentId(slug, reviewerUid);
    return [...(this.gameAssessmentHistory.get(id) ?? [])]
      .sort((a, b) => b.supersededAt.localeCompare(a.supersededAt))
      .map((row) => ({ ...row }));
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    const now = new Date().toISOString();
    const out: ReReviewRequest[] = [];
    for (const req of requests) {
      const id = reReviewRequestId(req.slug, req.reviewerUid);
      const record: ReReviewRequest = {
        id,
        slug: req.slug,
        reviewerUid: req.reviewerUid,
        status: 'open',
        gameVersion: req.gameVersion,
        reason: req.reason,
        createdAt: now,
        createdBy: req.createdBy,
        resolvedAt: null,
      };
      this.reReviewRequests.set(id, record);
      out.push({ ...record });
    }
    return out;
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const record = this.reReviewRequests.get(reReviewRequestId(slug, reviewerUid));
    return record ? { ...record } : null;
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    return Array.from(this.reReviewRequests.values())
      .filter((row) => row.reviewerUid === reviewerUid && row.status === 'open')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row }));
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    const sorted = Array.from(this.reReviewRequests.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row }));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const existing = this.reReviewRequests.get(id);
    if (!existing) return null;
    if (existing.status !== 'open') return { ...existing };
    const updated: ReReviewRequest = { ...existing, status: 'resolved', resolvedAt: new Date().toISOString() };
    this.reReviewRequests.set(id, updated);
    return { ...updated };
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    const record = this.gameAssessments.get(gameAssessmentId(slug, reviewerUid));
    return record ? hydrateGameAssessment(record.id, record) : null;
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.reviewerUid === reviewerUid)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    const sorted = Array.from(this.gameAssessments.values())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    return Array.from(this.gameAssessments.values())
      .filter((row) => row.source === source)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug))
      .map((row) => hydrateGameAssessment(row.id, row));
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    let total = 0;
    for (const row of this.gameAssessments.values()) {
      if (row.reviewerUid === uid) total += 1;
    }
    return total;
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    let deleted = 0;
    for (const [id, row] of this.gameAssessments) {
      if (row.reviewerUid === uid) {
        this.gameAssessments.delete(id);
        this.gameAssessmentHistory.delete(id);
        deleted += 1;
      }
    }
    for (const [id, row] of this.reReviewRequests) {
      if (row.reviewerUid === uid) this.reReviewRequests.delete(id);
    }
    return deleted;
  }
}

export class FirestoreReviewStore implements ReviewStore {
  constructor(private db: Firestore) {}

  private gameAssessmentsCollection() {
    return this.db.collection(GAME_ASSESSMENTS_COLLECTION);
  }

  async upsertGameAssessment(
    input: Omit<GameAssessment, 'id' | 'createdAt' | 'updatedAt' | 'gameVersion' | 'resolution'> & {
      createdAt?: string;
      gameVersion?: string | null;
    },
  ): Promise<GameAssessment> {
    const id = gameAssessmentId(input.slug, input.reviewerUid);
    const ref = this.gameAssessmentsCollection().doc(id);
    const now = new Date().toISOString();
    const existing = await ref.get();
    const createdAt =
      existing.exists && typeof existing.data()?.createdAt === 'string'
        ? (existing.data()!.createdAt as string)
        : (input.createdAt ?? now);
    const record: GameAssessment = {
      id,
      slug: input.slug,
      title: input.title,
      source: input.source,
      creatorHandle: input.creatorHandle,
      reviewerUid: input.reviewerUid,
      verdict: input.verdict,
      note: input.note,
      noteOrigin: input.noteOrigin,
      checklist: input.checklist ?? null,
      clientContext: input.clientContext ?? null,
      gameVersion: input.gameVersion ?? null,
      // Fresh judgment: prior follow-up stays on the archived row.
      resolution: null,
      createdAt,
      updatedAt: now,
    };
    // One batch: the archive and the replacement land together, or neither does.
    const batch = this.db.batch();
    if (existing.exists) {
      const prior = hydrateGameAssessment(id, existing.data() as Omit<GameAssessment, 'id'>);
      const { id: priorId, ...priorBody } = prior;
      batch.set(this.gameAssessmentHistoryCollection().doc(), {
        ...priorBody,
        assessmentId: priorId,
        supersededAt: now,
      });
    }
    batch.set(ref, {
      slug: record.slug,
      title: record.title,
      source: record.source,
      creatorHandle: record.creatorHandle,
      reviewerUid: record.reviewerUid,
      verdict: record.verdict,
      note: record.note,
      noteOrigin: record.noteOrigin,
      checklist: record.checklist,
      clientContext: record.clientContext,
      gameVersion: record.gameVersion,
      resolution: record.resolution,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    await batch.commit();
    return record;
  }

  async setGameAssessmentResolution(
    slug: string,
    reviewerUid: string,
    resolution: AssessmentResolution | null,
    expectedUpdatedAt?: string,
  ): Promise<ResolutionWriteResult> {
    const id = gameAssessmentId(slug, reviewerUid);
    const ref = this.gameAssessmentsCollection().doc(id);
    // A new verdict must not inherit this resolution.
    return this.db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { status: 'not_found' } as ResolutionWriteResult;
      const existing = hydrateGameAssessment(id, snap.data() as Omit<GameAssessment, 'id'>);
      if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
        return { status: 'stale', assessment: existing } as ResolutionWriteResult;
      }
      transaction.set(ref, { resolution }, { merge: true });
      return { status: 'ok', assessment: { ...existing, resolution } } as ResolutionWriteResult;
    });
  }

  async listGameAssessmentsBySlug(slug: string): Promise<GameAssessment[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.gameAssessmentsCollection().where('slug', '==', slug).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.reviewerUid.localeCompare(b.reviewerUid));
  }

  private gameAssessmentHistoryCollection() {
    return this.db.collection(GAME_ASSESSMENT_HISTORY_COLLECTION);
  }

  async listGameAssessmentHistory(slug: string, reviewerUid: string): Promise<GameAssessmentHistoryEntry[]> {
    const id = gameAssessmentId(slug, reviewerUid);
    // Equality query only; sort in memory, same shape as the assessments themselves.
    const snap = await this.gameAssessmentHistoryCollection().where('assessmentId', '==', id).get();
    return snap.docs
      .map((d) => {
        const { assessmentId, ...rest } = d.data() as Omit<GameAssessmentHistoryEntry, 'id'> & {
          assessmentId: string;
        };
        return {
          ...rest,
          id: d.id,
          checklist: rest.checklist ?? null,
          clientContext: rest.clientContext ?? null,
          resolution: rest.resolution ?? null,
        };
      })
      .sort((a, b) => b.supersededAt.localeCompare(a.supersededAt));
  }

  private reReviewRequestsCollection() {
    return this.db.collection(RE_REVIEW_REQUESTS_COLLECTION);
  }

  private hydrateReReviewRequest(id: string, data: Omit<ReReviewRequest, 'id'>): ReReviewRequest {
    return {
      ...data,
      id,
      gameVersion: data.gameVersion ?? null,
      reason: data.reason ?? null,
      resolvedAt: data.resolvedAt ?? null,
    };
  }

  async upsertReReviewRequests(
    requests: Array<Pick<ReReviewRequest, 'slug' | 'reviewerUid' | 'gameVersion' | 'reason' | 'createdBy'>>,
  ): Promise<ReReviewRequest[]> {
    const now = new Date().toISOString();
    const out: ReReviewRequest[] = [];
    for (let index = 0; index < requests.length; index += 400) {
      const batch = this.db.batch();
      const chunk = requests.slice(index, index + 400);
      const records = chunk.map((req) => {
        const id = reReviewRequestId(req.slug, req.reviewerUid);
        const record: ReReviewRequest = {
          id,
          slug: req.slug,
          reviewerUid: req.reviewerUid,
          status: 'open',
          gameVersion: req.gameVersion,
          reason: req.reason,
          createdAt: now,
          createdBy: req.createdBy,
          resolvedAt: null,
        };
        const { id: recordId, ...body } = record;
        batch.set(this.reReviewRequestsCollection().doc(recordId), body);
        return record;
      });
      await batch.commit();
      out.push(...records);
    }
    return out;
  }

  async getReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const snap = await this.reReviewRequestsCollection().doc(id).get();
    if (!snap.exists) return null;
    return this.hydrateReReviewRequest(id, snap.data() as Omit<ReReviewRequest, 'id'>);
  }

  async listOpenReReviewRequestsForReviewer(reviewerUid: string): Promise<ReReviewRequest[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.reReviewRequestsCollection()
      .where('reviewerUid', '==', reviewerUid)
      .where('status', '==', 'open')
      .get();
    return snap.docs
      .map((d) => this.hydrateReReviewRequest(d.id, d.data() as Omit<ReReviewRequest, 'id'>))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listReReviewRequests(opts?: { limit?: number }): Promise<ReReviewRequest[]> {
    const ordered = this.reReviewRequestsCollection().orderBy('createdAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => this.hydrateReReviewRequest(d.id, d.data() as Omit<ReReviewRequest, 'id'>));
  }

  async resolveReReviewRequest(slug: string, reviewerUid: string): Promise<ReReviewRequest | null> {
    const id = reReviewRequestId(slug, reviewerUid);
    const ref = this.reReviewRequestsCollection().doc(id);
    const snap = await ref.get();
    if (!snap.exists) return null;
    const existing = this.hydrateReReviewRequest(id, snap.data() as Omit<ReReviewRequest, 'id'>);
    if (existing.status !== 'open') return existing;
    const resolvedAt = new Date().toISOString();
    await ref.set({ status: 'resolved', resolvedAt }, { merge: true });
    return { ...existing, status: 'resolved', resolvedAt };
  }

  async getGameAssessment(slug: string, reviewerUid: string): Promise<GameAssessment | null> {
    const id = gameAssessmentId(slug, reviewerUid);
    const snap = await this.gameAssessmentsCollection().doc(id).get();
    if (!snap.exists) return null;
    return hydrateGameAssessment(id, snap.data() as Omit<GameAssessment, 'id'>);
  }

  async listGameAssessmentsByReviewer(reviewerUid: string): Promise<GameAssessment[]> {
    // Equality query only; sort in memory.
    const snap = await this.gameAssessmentsCollection().where('reviewerUid', '==', reviewerUid).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
  }

  async listGameAssessments(opts?: { limit?: number }): Promise<GameAssessment[]> {
    const ordered = this.gameAssessmentsCollection().orderBy('updatedAt', 'desc');
    const snap = await (opts?.limit === undefined ? ordered : ordered.limit(opts.limit)).get();
    return snap.docs.map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>));
  }

  async listGameAssessmentsBySource(source: AssessmentSource): Promise<GameAssessment[]> {
    // Equality only — no orderBy / composite index.
    const snap = await this.gameAssessmentsCollection().where('source', '==', source).get();
    return snap.docs
      .map((d) => hydrateGameAssessment(d.id, d.data() as Omit<GameAssessment, 'id'>))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slug.localeCompare(b.slug));
  }

  async countGameAssessmentsByUid(uid: string): Promise<number> {
    const snap = await this.gameAssessmentsCollection().where('reviewerUid', '==', uid).count().get();
    return snap.data().count;
  }

  async deleteGameAssessmentsByUid(uid: string): Promise<number> {
    const [assessments, history, reReviews] = await Promise.all([
      this.gameAssessmentsCollection().where('reviewerUid', '==', uid).get(),
      this.gameAssessmentHistoryCollection().where('reviewerUid', '==', uid).get(),
      this.reReviewRequestsCollection().where('reviewerUid', '==', uid).get(),
    ]);
    const refs = [...assessments.docs, ...history.docs, ...reReviews.docs].map((d) => d.ref);
    for (let index = 0; index < refs.length; index += 400) {
      const batch = this.db.batch();
      for (const ref of refs.slice(index, index + 400)) batch.delete(ref);
      await batch.commit();
    }
    return assessments.docs.length;
  }
}
