import type { SubmissionStore } from './slices/submission.js';
import type { GameAccessStore } from './slices/game-access.js';
import type { GameAccessRecord } from './records/game-access.js';
import type { SubmissionQueryStore } from './slices/submission-queries.js';
export abstract class SubmissionFacade {
  protected abstract submissionStore: SubmissionStore;
  protected abstract gameAccessStore: GameAccessStore;
  protected abstract submissionQueryStore: SubmissionQueryStore;
  async setLocalActivity(
    jobId: number,
    activity: import('@gamedevpl/contract').LocalActivity,
    start: boolean,
  ): Promise<boolean> {
    return this.submissionStore.setLocalActivity(jobId, activity, start);
  }
  // Access record created here so no slug caller forgets it.

  // Only while the name is uncontested; a contested one waits for settleSlugClaim.
  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    await this.submissionStore.setSubmissionSlug(jobId, slug);
    const job = await this.submissionStore.getSubmission(jobId);
    if (!job?.ownerUid) return;
    const claimants = await this.submissionQueryStore.listSubmissionsBySlug(slug);
    const owners = new Set(claimants.filter((record) => !record.abandonedAt).map((record) => record.ownerUid));
    if (owners.size !== 1 || !owners.has(job.ownerUid)) return;
    await this.gameAccessStore.ensureGameAccess(slug, job.ownerUid, new Date().toISOString());
  }
  async setSubmissionTitle(jobId: number, title: string): Promise<void> {
    return this.submissionStore.setSubmissionTitle(jobId, title);
  }
  async setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionDeliveredVersion(jobId, version);
  }
  async setSubmissionPreviewVersion(jobId: number, version: string): Promise<void> {
    return this.submissionStore.setSubmissionPreviewVersion(jobId, version);
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.getGameAccess(slug);
  }

  async ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord> {
    return this.gameAccessStore.ensureGameAccess(slug, ownerUid, at);
  }

  async recordSettledOwner(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord> {
    return this.gameAccessStore.recordSettledOwner(slug, ownerUid, at);
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return this.gameAccessStore.listGameAccessByMember(uid);
  }
}
