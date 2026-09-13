import type { SubmissionStore } from './slices/submission.js';
import type { GameAccessStore } from './slices/game-access.js';
import type { GameAccessRecord } from './records/game-access.js';
export abstract class SubmissionFacade {
  protected abstract submissionStore: SubmissionStore;
  protected abstract gameAccessStore: GameAccessStore;
  async setLocalActivity(
    jobId: number,
    activity: import('@gamedevpl/contract').LocalActivity,
    start: boolean,
  ): Promise<boolean> {
    return this.submissionStore.setLocalActivity(jobId, activity, start);
  }
  // Access record created here so no slug caller forgets it.
  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    await this.submissionStore.setSubmissionSlug(jobId, slug);
    const record = await this.submissionStore.getSubmission(jobId);
    if (!record?.ownerUid) return;
    await this.gameAccessStore.ensureGameAccess(slug, record.ownerUid, new Date().toISOString());
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

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return this.gameAccessStore.listGameAccessByMember(uid);
  }
}
