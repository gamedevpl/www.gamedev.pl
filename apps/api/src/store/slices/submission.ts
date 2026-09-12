import type { LocalActivity } from '@gamedevpl/contract';
import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { isRoundOpen } from '../../platform/sweep-scope.js';
import type { SubmissionStatus } from '../../platform/submission-status.js';
import { fromStoredSubmission, type SubmissionRecord } from '../records/submission.js';

export interface SubmissionStore {
  beginCheckoutRecovery(slug: string, nonce: string, now: number): Promise<boolean>;
  finishCheckoutRecovery(slug: string, nonce: string): Promise<void>;
  claimSubmissionSlug(
    jobId: number,
    slug: string,
    sourceJobId: number | null,
    recovery?: { key: string; spec: string; locale: string },
  ): Promise<boolean>;
  setLocalActivity(jobId: number, activity: LocalActivity, start: boolean): Promise<boolean>;
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

  // Operator-only: blocks sharing and the public draft read.
  setModerationBlocked(jobId: number, at: string | null): Promise<void>;

  // Records the creator's language for progress reports.
  setSubmissionLocale(jobId: number, locale: string): Promise<void>;

  // Records how many QA answers reached the agent with this submission.
  setSubmissionClarificationCount(jobId: number, count: number): Promise<void>;

  // Persists what the agent builds from; written once, not cleared on rounds.
  setSubmissionDispatchBrief(jobId: number, brief: string): Promise<void>;

  setSubmissionBrief(
    jobId: number,
    brief: { spec: string; qa: string[]; specIsSystemGenerated?: boolean },
  ): Promise<void>;
}

export { InMemorySubmissionStore } from './submission-memory.js';

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

  async setLocalActivity(jobId: number, activity: LocalActivity, start: boolean): Promise<boolean> {
    const ref = this.ref(jobId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (
        !doc.exists ||
        (!start &&
          (doc.data()?.localActivity?.runId !== activity.runId ||
            doc.data()?.localActivity?.generation !== (doc.data()?.roundGeneration ?? 0)))
      )
        return false;
      tx.update(ref, { localActivity: { ...activity, generation: doc.data()?.roundGeneration ?? 0 } });
      return true;
    });
  }

  async beginCheckoutRecovery(slug: string, nonce: string, now: number): Promise<boolean> {
    const ref = this.db.collection('games').doc(slug);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if ((snap.data()?.recoveryAdmission?.until ?? 0) > now) return false;
      tx.set(ref, { recoveryAdmission: { nonce, until: now + 15 * 60_000 } }, { merge: true });
      return true;
    });
  }
  async finishCheckoutRecovery(slug: string, nonce: string): Promise<void> {
    const ref = this.db.collection('games').doc(slug);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.recoveryAdmission?.nonce === nonce) tx.update(ref, { recoveryAdmission: FieldValue.delete() });
    });
  }
  async claimSubmissionSlug(
    jobId: number,
    slug: string,
    sourceJobId: number | null,
    recovery?: { key: string; spec: string; locale: string },
  ): Promise<boolean> {
    return this.db.runTransaction(async (tx) => {
      const target = await tx.get(this.ref(jobId));
      const rows = await tx.get(this.db.collection('submissions').where('slug', '==', slug));
      const game = await tx.get(this.db.collection('games').doc(slug));
      const publication = game.data()?.publication;
      const archived = publication?.state === 'archived' && publication.takedownReason === 'deleted by creator';
      if (publication && !(sourceJobId !== null && archived)) return false;
      const records = rows.docs.map((d) => fromStoredSubmission(d.data()));
      const holder = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId)[0];
      if (!target.exists || target.data()?.slug) return false;
      if (
        sourceJobId === null
          ? records.length > 0
          : !holder ||
            holder.jobId !== sourceJobId ||
            holder.ownerUid !== target.data()?.ownerUid ||
            (holder.state !== 'canceled' &&
              !(archived && ['published', 'failed', 'abandoned'].includes(holder.state ?? ''))) ||
            holder.moderationBlockedAt
      )
        return false;
      tx.set(this.db.collection('games').doc(slug), { slugClaimJobId: jobId }, { merge: true });
      tx.update(this.ref(jobId), {
        slug,
        ...(recovery
          ? {
              recoveryKey: recovery.key,
              spec: recovery.spec,
              qa: [],
              locale: recovery.locale,
              builder: 'self' as const,
              state: 'queued' as const,
              stateSince: new Date().toISOString(),
              transitions: [
                {
                  to: 'queued' as const,
                  at: new Date().toISOString(),
                  by: 'creator' as const,
                  reason: 'checkout_recovered',
                },
              ],
            }
          : {}),
      });
      return true;
    });
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

  async setModerationBlocked(jobId: number, at: string | null): Promise<void> {
    await this.ref(jobId).set({ moderationBlockedAt: at ?? FieldValue.delete() }, { merge: true });
  }

  async setSubmissionLocale(jobId: number, locale: string): Promise<void> {
    await this.ref(jobId).set({ locale }, { merge: true });
  }

  async setSubmissionClarificationCount(jobId: number, count: number): Promise<void> {
    await this.ref(jobId).set({ clarificationCount: count }, { merge: true });
  }

  async setSubmissionDispatchBrief(jobId: number, brief: string): Promise<void> {
    await this.ref(jobId).set({ dispatchBrief: brief }, { merge: true });
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
