import type { SubmissionStore } from './slices/submission.js';
import type { GameAccessStore } from './slices/game-access.js';
import type { GameAccessRecord } from './records/game-access.js';
import type { SubmissionQueryStore } from './slices/submission-queries.js';
export abstract class SubmissionFacade {
  protected abstract submissionStore: SubmissionStore;
  protected abstract gameAccessStore: GameAccessStore;
  protected abstract submissionQueryStore: SubmissionQueryStore;
  async claimManualRoundSlug(
    jobId: number,
    slug: string,
    sourceJobId: number,
    admissionNonce?: string,
  ): Promise<boolean> {
    return this.submissionStore.claimManualRoundSlug(jobId, slug, sourceJobId, admissionNonce);
  }
  async beginCheckoutRecovery(slug: string, nonce: string, now: number): Promise<boolean> {
    return this.submissionStore.beginCheckoutRecovery(slug, nonce, now);
  }
  async finishCheckoutRecovery(slug: string, nonce: string): Promise<void> {
    return this.submissionStore.finishCheckoutRecovery(slug, nonce);
  }
  async setLocalActivity(
    jobId: number,
    activity: import('@gamedevpl/contract').LocalActivity,
    start: boolean,
  ): Promise<boolean> {
    return this.submissionStore.setLocalActivity(jobId, activity, start);
  }
  // An atomic claim settles authority, so it writes the record.
  async claimSubmissionSlug(
    jobId: number,
    slug: string,
    sourceJobId: number | null,
    recovery?: { key: string; spec: string; locale: string; admissionNonce?: string },
  ): Promise<boolean> {
    const won = await this.submissionStore.claimSubmissionSlug(jobId, slug, sourceJobId, recovery);
    if (!won) return false;
    const job = await this.submissionStore.getSubmission(jobId);
    if (job?.ownerUid)
      await this.gameAccessStore.recordSettledOwner(slug, job.ownerUid, jobId, new Date().toISOString());
    return true;
  }

  // Access record created here so no slug caller forgets it.

  // Only while the name is uncontested; a contested one waits for settleSlugClaim.
  async setSubmissionSlug(jobId: number, slug: string, admissionNonce?: string): Promise<void> {
    await this.submissionStore.setSubmissionSlug(jobId, slug, admissionNonce);
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

  async ensureGameAccess(slug: string, ownerUid: string, at: string): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.ensureGameAccess(slug, ownerUid, at);
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    at: string,
  ): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.recordSettledOwner(slug, ownerUid, jobId, at);
  }

  async beginAccountErasure(uid: string, at: string): Promise<void> {
    return this.gameAccessStore.beginAccountErasure(uid, at);
  }

  async eraseMemberFromAllGameAccess(uid: string, at: string): Promise<string[]> {
    return this.gameAccessStore.eraseMemberFromAllGameAccess(uid, at);
  }

  async backfillGameAccess(
    slug: string,
    ownerUid: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.backfillGameAccess(slug, ownerUid, checkAccount, at);
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return this.gameAccessStore.listGameAccessByMember(uid);
  }
}
