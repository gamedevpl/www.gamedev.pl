import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { isRoundOpen } from '../../platform/sweep-scope.js';
import type { SubmissionStatus } from '../../platform/submission-status.js';
import { fromStoredSubmission, type SubmissionRecord } from '../records/submission.js';

export interface SubmissionStore {
  createSubmission(jobId: number, ownerUid: string, title: string): Promise<SubmissionRecord>;

  getSubmission(jobId: number): Promise<SubmissionRecord | null>;

  setSubmissionNotifiedStatus(jobId: number, status: SubmissionStatus): Promise<void>;

  // Records the status last derived from GitHub, notified or not.
  setSubmissionLastStatus(jobId: number, status: SubmissionStatus): Promise<void>;

  // Records the game directory a submission is building, once it is known.
  setSubmissionSlug(jobId: number, slug: string): Promise<void>;

  // Updates the shelf/studio/notification name -- delivery adopts the SPEC title.
  setSubmissionTitle(jobId: number, title: string): Promise<void>;

  // Records the candidate version a delivery just stored.
  setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void>;

  // Latest playable version for Studio (preview or publish).
  setSubmissionPreviewVersion(jobId: number, version: string): Promise<void>;

  // Counts a send-back for finishing without delivering. Returns the new total.
  recordDeliveryNudge(jobId: number): Promise<number>;

  // Stamps when a submission was first seen published (build-time stats).
  setSubmissionPublishedAt(jobId: number, at: string): Promise<void>;

  // Marks a submission abandoned by its creator.
  setSubmissionAbandoned(jobId: number, at: string): Promise<void>;

  // Turns the shared draft link on (a timestamp) or off (null).
  setDraftShared(jobId: number, at: string | null): Promise<void>;

  // Records the creator's language for progress reports.
  setSubmissionLocale(jobId: number, locale: string): Promise<void>;

  // Records how many QA answers reached the agent with this submission.
  setSubmissionClarificationCount(jobId: number, count: number): Promise<void>;

  // Persists what the agent builds from; written once, not cleared on rounds.
  setSubmissionBrief(
    jobId: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void>;
}

export class InMemorySubmissionStore implements SubmissionStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async createSubmission(jobId: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      jobId,
      ownerUid,
      createdAt,
      title,
      // Legacy records predating this field stay unset until their round closes.
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    this.submissions.set(jobId, record);
    return { ...record };
  }

  async getSubmission(jobId: number): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(jobId);
    return sub ? { ...sub } : null;
  }

  async setSubmissionNotifiedStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, lastNotifiedStatus: status });
  }

  async setSubmissionLastStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, lastStatus: status });
  }

  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, slug });
  }

  async setSubmissionTitle(jobId: number, title: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, title });
  }

  async setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, deliveredVersion: version, previewVersion: version });
  }

  async setSubmissionPreviewVersion(jobId: number, version: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, previewVersion: version });
  }

  async recordDeliveryNudge(jobId: number): Promise<number> {
    const sub = this.submissions.get(jobId);
    if (!sub) return 0;
    const deliveryNudges = (sub.deliveryNudges ?? 0) + 1;
    this.submissions.set(jobId, { ...sub, deliveryNudges });
    return deliveryNudges;
  }

  async setSubmissionPublishedAt(jobId: number, at: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub && !sub.publishedAt) this.submissions.set(jobId, { ...sub, publishedAt: at });
  }

  async setSubmissionAbandoned(jobId: number, at: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, abandonedAt: at });
  }

  async setDraftShared(jobId: number, at: string | null): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const next = { ...sub };
    if (at) next.draftSharedAt = at;
    else delete next.draftSharedAt;
    this.submissions.set(jobId, next);
  }

  async setSubmissionLocale(jobId: number, locale: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, locale });
  }

  async setSubmissionClarificationCount(jobId: number, count: number): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, clarificationCount: count });
  }

  async setSubmissionBrief(
    jobId: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) {
      this.submissions.set(jobId, {
        ...sub,
        spec: brief.spec,
        qa: brief.qa,
        ...(brief.specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
      });
    }
  }
}

export class FirestoreSubmissionStore implements SubmissionStore {
  constructor(private db: Firestore) {}

  private ref(jobId: number) {
    return this.db.collection('submissions').doc(String(jobId));
  }

  async createSubmission(jobId: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      jobId,
      ownerUid,
      createdAt,
      title,
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    // Dual-write the pre-rename key too: a rollback to the previous revision (traffic
    // reassignment, seconds, no rebuild — docs/runbooks/rollback-deploy.md) runs code that
    // only reads `issueNumber`. Drop once that revision is no longer a rollback target.
    await this.ref(jobId).set({ ...record, issueNumber: jobId, openRound: true });
    return record;
  }

  async getSubmission(jobId: number): Promise<SubmissionRecord | null> {
    const snap = await this.ref(jobId).get();
    if (!snap.exists) return null;
    return fromStoredSubmission(snap.data());
  }

  // Read-first: the flag needs fields this write does not touch.
  private async setStatus(jobId: number, patch: Partial<SubmissionRecord>): Promise<void> {
    const ref = this.ref(jobId);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const next = { ...fromStoredSubmission(snap.data()), ...patch };
      tx.set(ref, { ...patch, openRound: isRoundOpen(next) }, { merge: true });
    });
  }

  async setSubmissionNotifiedStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    await this.setStatus(jobId, { lastNotifiedStatus: status });
  }

  async setSubmissionLastStatus(jobId: number, status: SubmissionStatus): Promise<void> {
    await this.setStatus(jobId, { lastStatus: status });
  }

  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    await this.ref(jobId).set({ slug }, { merge: true });
  }

  async setSubmissionTitle(jobId: number, title: string): Promise<void> {
    await this.ref(jobId).set({ title }, { merge: true });
  }

  async setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void> {
    // Last write wins -- the newest delivery is worth previewing.
    await this.ref(jobId).set({ deliveredVersion: version, previewVersion: version }, { merge: true });
  }

  async setSubmissionPreviewVersion(jobId: number, version: string): Promise<void> {
    await this.ref(jobId).set({ previewVersion: version }, { merge: true });
  }

  async recordDeliveryNudge(jobId: number): Promise<number> {
    // Transactional -- a lost increment grants an unowed agent session.
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const nudges = (fromStoredSubmission(snap.data()).deliveryNudges ?? 0) + 1;
      tx.set(ref, { deliveryNudges: nudges }, { merge: true });
      return nudges;
    });
  }

  async setSubmissionPublishedAt(jobId: number, at: string): Promise<void> {
    const ref = this.ref(jobId);
    const snap = await ref.get();
    // First observation wins: a later re-derivation must not move the timestamp.
    if (snap.exists && fromStoredSubmission(snap.data()).publishedAt) return;
    await ref.set({ publishedAt: at }, { merge: true });
  }

  async setSubmissionAbandoned(jobId: number, at: string): Promise<void> {
    // Abandonment closes the round, so no read is needed.
    await this.ref(jobId).set({ abandonedAt: at, openRound: false }, { merge: true });
  }

  async setDraftShared(jobId: number, at: string | null): Promise<void> {
    // Deleted, not set false -- "shared" is one shape: present or absent.
    await this.ref(jobId).set({ draftSharedAt: at ?? FieldValue.delete() }, { merge: true });
  }

  async setSubmissionLocale(jobId: number, locale: string): Promise<void> {
    await this.ref(jobId).set({ locale }, { merge: true });
  }

  async setSubmissionClarificationCount(jobId: number, count: number): Promise<void> {
    await this.ref(jobId).set({ clarificationCount: count }, { merge: true });
  }

  async setSubmissionBrief(
    jobId: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    await this.ref(jobId).set(
      {
        spec: brief.spec,
        qa: brief.qa,
        ...(brief.specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
      },
      { merge: true },
    );
  }
}
