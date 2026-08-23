import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { SubmissionStatus } from '../../submission-status.js';
import type { SubmissionRecord } from '../records/submission.js';

export interface SubmissionStore {
  createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord>;

  getSubmission(issueNumber: number): Promise<SubmissionRecord | null>;

  setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;

  // Records the status last derived from GitHub, notified or not.
  setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void>;

  // Records the game directory a submission is building, once it is known.
  setSubmissionSlug(issueNumber: number, slug: string): Promise<void>;

  // Updates the shelf/studio/notification name -- delivery adopts the SPEC title.
  setSubmissionTitle(issueNumber: number, title: string): Promise<void>;

  // Records the candidate version a delivery just stored.
  setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void>;

  // Latest playable version for Studio (preview or publish).
  setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void>;

  // Counts a send-back for finishing without delivering. Returns the new total.
  recordDeliveryNudge(issueNumber: number): Promise<number>;

  // Stamps when a submission was first seen published (build-time stats).
  setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void>;

  // Marks a submission abandoned by its creator.
  setSubmissionAbandoned(issueNumber: number, at: string): Promise<void>;

  // Turns the shared draft link on (a timestamp) or off (null).
  setDraftShared(issueNumber: number, at: string | null): Promise<void>;

  // Records the creator's language for progress reports.
  setSubmissionLocale(issueNumber: number, locale: string): Promise<void>;

  // Records how many QA answers reached the agent with this submission.
  setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void>;

  // Persists what the agent builds from; written once, not cleared on rounds.
  setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void>;
}

export class InMemorySubmissionStore implements SubmissionStore {
  constructor(private submissions: Map<number, SubmissionRecord>) {}

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt,
      title,
      // Legacy records predating this field stay unset until their round closes.
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    this.submissions.set(issueNumber, record);
    return { ...record };
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const sub = this.submissions.get(issueNumber);
    return sub ? { ...sub } : null;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastNotifiedStatus: status });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, lastStatus: status });
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, slug });
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, title });
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, deliveredVersion: version, previewVersion: version });
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, previewVersion: version });
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return 0;
    const deliveryNudges = (sub.deliveryNudges ?? 0) + 1;
    this.submissions.set(issueNumber, { ...sub, deliveryNudges });
    return deliveryNudges;
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub && !sub.publishedAt) this.submissions.set(issueNumber, { ...sub, publishedAt: at });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, abandonedAt: at });
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (!sub) return;
    const next = { ...sub };
    if (at) next.draftSharedAt = at;
    else delete next.draftSharedAt;
    this.submissions.set(issueNumber, next);
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, locale });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) this.submissions.set(issueNumber, { ...sub, clarificationCount: count });
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    const sub = this.submissions.get(issueNumber);
    if (sub) {
      this.submissions.set(issueNumber, {
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

  private ref(issueNumber: number) {
    return this.db.collection('submissions').doc(String(issueNumber));
  }

  async createSubmission(issueNumber: number, ownerUid: string, title: string): Promise<SubmissionRecord> {
    const createdAt = new Date().toISOString();
    const record: SubmissionRecord = {
      issueNumber,
      ownerUid,
      createdAt,
      title,
      roundGeneration: 1,
      roundStartedAt: createdAt,
    };
    await this.ref(issueNumber).set(record);
    return record;
  }

  async getSubmission(issueNumber: number): Promise<SubmissionRecord | null> {
    const snap = await this.ref(issueNumber).get();
    if (!snap.exists) return null;
    return snap.data() as SubmissionRecord;
  }

  async setSubmissionNotifiedStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.ref(issueNumber).set({ lastNotifiedStatus: status }, { merge: true });
  }

  async setSubmissionLastStatus(issueNumber: number, status: SubmissionStatus): Promise<void> {
    await this.ref(issueNumber).set({ lastStatus: status }, { merge: true });
  }

  async setSubmissionSlug(issueNumber: number, slug: string): Promise<void> {
    await this.ref(issueNumber).set({ slug }, { merge: true });
  }

  async setSubmissionTitle(issueNumber: number, title: string): Promise<void> {
    await this.ref(issueNumber).set({ title }, { merge: true });
  }

  async setSubmissionDeliveredVersion(issueNumber: number, version: string): Promise<void> {
    // Last write wins -- the newest delivery is worth previewing.
    await this.ref(issueNumber).set({ deliveredVersion: version, previewVersion: version }, { merge: true });
  }

  async setSubmissionPreviewVersion(issueNumber: number, version: string): Promise<void> {
    await this.ref(issueNumber).set({ previewVersion: version }, { merge: true });
  }

  async recordDeliveryNudge(issueNumber: number): Promise<number> {
    // Transactional -- a lost increment grants an unowed agent session.
    const ref = this.ref(issueNumber);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 0;
      const nudges = ((snap.data() as SubmissionRecord).deliveryNudges ?? 0) + 1;
      tx.set(ref, { deliveryNudges: nudges }, { merge: true });
      return nudges;
    });
  }

  async setSubmissionPublishedAt(issueNumber: number, at: string): Promise<void> {
    const ref = this.ref(issueNumber);
    const snap = await ref.get();
    // First observation wins: a later re-derivation must not move the timestamp.
    if ((snap.data() as SubmissionRecord | undefined)?.publishedAt) return;
    await ref.set({ publishedAt: at }, { merge: true });
  }

  async setSubmissionAbandoned(issueNumber: number, at: string): Promise<void> {
    await this.ref(issueNumber).set({ abandonedAt: at }, { merge: true });
  }

  async setDraftShared(issueNumber: number, at: string | null): Promise<void> {
    // Deleted, not set false -- "shared" is one shape: present or absent.
    await this.ref(issueNumber).set({ draftSharedAt: at ?? FieldValue.delete() }, { merge: true });
  }

  async setSubmissionLocale(issueNumber: number, locale: string): Promise<void> {
    await this.ref(issueNumber).set({ locale }, { merge: true });
  }

  async setSubmissionClarificationCount(issueNumber: number, count: number): Promise<void> {
    await this.ref(issueNumber).set({ clarificationCount: count }, { merge: true });
  }

  async setSubmissionBrief(
    issueNumber: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void> {
    await this.ref(issueNumber).set(
      {
        spec: brief.spec,
        qa: brief.qa,
        ...(brief.specIsSystemGenerated ? { specIsSystemGenerated: true } : {}),
      },
      { merge: true },
    );
  }
}
