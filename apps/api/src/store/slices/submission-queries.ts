import type { Firestore } from '@google-cloud/firestore';
import { isSweepActive } from '../../sweep-scope.js';
import type { SubmissionRecord } from '../records/submission.js';

export interface SubmissionQueryStore {
  // Most recently published submissions, newest first -- the build-time sample.
  listRecentlyPublished(limit: number): Promise<SubmissionRecord[]>;

  // Resolves a slug to its newest submission -- the shareable-draft-link lookup.
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;

  // Every submission claiming this slug, newest first (published plus in-flight).
  listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]>;

  // The published submission for a slug, ignoring in-flight work.
  getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;

  // Submissions the sweep should still check -- not terminal and notified.
  listActiveSubmissions(): Promise<SubmissionRecord[]>;

  // Submissions a creator can see with no slug -- the backfill.
  listSubmissionsMissingSlug(): Promise<SubmissionRecord[]>;

  // Delivered games whose shelf title may still be the truncated prompt.
  listSubmissionsWithDelivery(): Promise<SubmissionRecord[]>;

  // Every submission a creator owns, newest first -- backs the "my games" rail.
  listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]>;

  listQueuedSubmissions(): Promise<SubmissionRecord[]>;
}

export class InMemorySubmissionQueryStore implements SubmissionQueryStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.publishedAt)
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    // Newest first -- a slug can now have more than one job.
    const records = await this.listSubmissionsBySlug(slug);
    return records[0] ?? null;
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.slug === slug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ ...s }));
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    const match = Array.from(this.submissions.values())
      .filter((s) => s.slug === slug && s.publishedAt && !s.abandonedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return match ? { ...match } : null;
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter(isSweepActive)
      .map((s) => ({ ...s }));
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => !s.slug && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => Boolean(s.slug && s.deliveredVersion) && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    const sorted = Array.from(this.submissions.values())
      .filter((s) => s.ownerUid === ownerUid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ ...s }));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.state === 'queued')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({ ...s }));
  }
}

export class FirestoreSubmissionQueryStore implements SubmissionQueryStore {
  constructor(private db: Firestore) {}

  async listRecentlyPublished(limit: number): Promise<SubmissionRecord[]> {
    // Auto-indexed single-field orderBy; docs without publishedAt are excluded by definition.
    const snap = await this.db.collection('submissions').orderBy('publishedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord);
  }

  async getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    const records = await this.listSubmissionsBySlug(slug);
    return records[0] ?? null;
  }

  async listSubmissionsBySlug(slug: string): Promise<SubmissionRecord[]> {
    // Equality-only query, no composite index needed; bounded by jobs per game.
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getPublishedSubmissionBySlug(slug: string): Promise<SubmissionRecord | null> {
    // Same query, filtered in memory to avoid a composite index.
    const snap = await this.db.collection('submissions').where('slug', '==', slug).get();
    const records = snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((record) => record.publishedAt && !record.abandonedAt);
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records[0] ?? null;
  }

  async listActiveSubmissions(): Promise<SubmissionRecord[]> {
    // 'in' would need a composite index and miss unset lastNotifiedStatus docs.
    const snap = await this.db.collection('submissions').get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).filter(isSweepActive);
  }

  async listSubmissionsMissingSlug(): Promise<SubmissionRecord[]> {
    // Firestore can't query for an absent field -- a small full scan.
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((s) => !s.slug && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSubmissionsWithDelivery(): Promise<SubmissionRecord[]> {
    const snap = await this.db.collection('submissions').get();
    return snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .filter((s) => Boolean(s.slug && s.deliveredVersion) && !s.abandonedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listSubmissionsByOwner(ownerUid: string, opts?: { limit?: number }): Promise<SubmissionRecord[]> {
    // Equality-only, no orderBy -- no composite index; sorted here instead.
    const snap = await this.db.collection('submissions').where('ownerUid', '==', ownerUid).get();
    const sorted = snap.docs
      .map((d) => d.data() as SubmissionRecord)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit !== undefined ? sorted.slice(0, opts.limit) : sorted;
  }

  async listQueuedSubmissions(): Promise<SubmissionRecord[]> {
    const snap = await this.db.collection('submissions').where('state', '==', 'queued').get();
    return snap.docs.map((d) => d.data() as SubmissionRecord).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
