import type { SubmissionStore } from './slices/submission.js';
import type { GameAccessStore } from './slices/game-access.js';
import type { GameAccessRecord } from './records/game-access.js';
import type { GameTransferStore } from './slices/game-transfer.js';
import type { GameTransferInvitation } from './records/game-transfer.js';
import type { SubmissionQueryStore } from './slices/submission-queries.js';
import type { ShelfMirror } from '../creation/shelf-mirror.js';
export abstract class SubmissionFacade {
  protected abstract submissionStore: SubmissionStore;
  protected abstract gameAccessStore: GameAccessStore;
  protected abstract gameTransferStore: GameTransferStore;
  protected abstract submissionQueryStore: SubmissionQueryStore;

  // Mirrors the owner's rounds; see creation/shelf-mirror.ts.
  protected abstract shelfMirror: ShelfMirror;
  async claimManualRoundSlug(
    jobId: number,
    slug: string,
    sourceJobId: number,
    admissionNonce?: string,
  ): Promise<boolean> {
    const won = await this.submissionStore.claimManualRoundSlug(jobId, slug, sourceJobId, admissionNonce);
    // An atomic claim writes the slug itself.
    if (won) await this.shelfMirror.afterJobWrite(jobId);
    return won;
  }
  async beginCheckoutRecovery(slug: string, nonce: string, now: number): Promise<boolean> {
    return this.submissionStore.beginCheckoutRecovery(slug, nonce, now);
  }
  async finishCheckoutRecovery(slug: string, nonce: string): Promise<void> {
    return this.submissionStore.finishCheckoutRecovery(slug, nonce);
  }
  async hasActiveCheckoutRecovery(slug: string, now: number): Promise<boolean> {
    return this.submissionStore.hasActiveCheckoutRecovery(slug, now);
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

    await this.shelfMirror.afterJobWrite(jobId);
    // The claim is durable; a failed record cannot fail it.
    await this.tryRecordOwner(jobId, slug);
    return true;
  }

  // Access record created here so no slug caller forgets it.

  // Only while the name is uncontested; a contested one waits for settleSlugClaim.
  async setSubmissionSlug(jobId: number, slug: string, admissionNonce?: string): Promise<void> {
    await this.submissionStore.setSubmissionSlug(jobId, slug, admissionNonce);
    // Before the access block: its early returns must not skip the mirror.
    await this.shelfMirror.afterJobWrite(jobId);
    try {
      const job = await this.submissionStore.getSubmission(jobId);
      if (!job?.ownerUid) return;
      const claimants = await this.submissionQueryStore.listSubmissionsBySlug(slug);
      const owners = new Set(claimants.filter((record) => !record.abandonedAt).map((record) => record.ownerUid));
      if (owners.size !== 1 || !owners.has(job.ownerUid)) return;
      await this.gameAccessStore.ensureGameAccess(slug, job.ownerUid, job.createdAt, new Date().toISOString());
    } catch {
      // Derived state: the backfill repairs it, a throw would not.
    }
  }

  // Derived from the claim: repairable, never fatal.
  private async tryRecordOwner(jobId: number, slug: string): Promise<void> {
    try {
      const job = await this.submissionStore.getSubmission(jobId);
      if (!job?.ownerUid) return;
      await this.gameAccessStore.recordSettledOwner(slug, job.ownerUid, jobId, job.createdAt, new Date().toISOString());
    } catch {
      // A throw here would strand a slug the claim already took.
    }
  }
  async setSubmissionTitle(jobId: number, title: string): Promise<void> {
    await this.submissionStore.setSubmissionTitle(jobId, title);
    await this.shelfMirror.afterJobWrite(jobId);
  }
  async setSubmissionDeliveredVersion(jobId: number, version: string): Promise<void> {
    await this.submissionStore.setSubmissionDeliveredVersion(jobId, version);
    await this.shelfMirror.afterJobWrite(jobId);
  }
  async setSubmissionPreviewVersion(jobId: number, version: string): Promise<void> {
    await this.submissionStore.setSubmissionPreviewVersion(jobId, version);
    await this.shelfMirror.afterJobWrite(jobId);
  }

  async getGameAccess(slug: string): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.getGameAccess(slug);
  }

  async ensureGameAccess(slug: string, ownerUid: string, workAt: string, at: string): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.ensureGameAccess(slug, ownerUid, workAt, at);
  }

  async recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.recordSettledOwner(slug, ownerUid, jobId, workAt, at);
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
    jobId: number,
    workAt: string,
    checkAccount: boolean,
    at: string,
  ): Promise<GameAccessRecord | null> {
    return this.gameAccessStore.backfillGameAccess(slug, ownerUid, jobId, workAt, checkAccount, at);
  }

  async getAccountErasure(uid: string): Promise<string | null> {
    return this.gameAccessStore.getAccountErasure(uid);
  }

  async accountExists(uid: string): Promise<boolean> {
    return this.gameAccessStore.accountExists(uid);
  }

  async listGameAccessByMember(uid: string): Promise<GameAccessRecord[]> {
    return this.gameAccessStore.listGameAccessByMember(uid);
  }

  async getActiveGameTransfer(slug: string, at: string): Promise<GameTransferInvitation | null> {
    return this.gameTransferStore.getActiveGameTransfer(slug, at);
  }

  async createGameTransferInvitation(
    slug: string,
    senderUid: string,
    recipientUid: string,
    accessRevision: number,
    at: string,
    recipientCode?: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner'> {
    return this.gameTransferStore.createGameTransferInvitation(
      slug,
      senderUid,
      recipientUid,
      accessRevision,
      at,
      recipientCode,
    );
  }

  async acceptGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
  ): Promise<GameTransferInvitation | 'busy' | 'ineligible' | 'stale_owner' | null> {
    return this.gameTransferStore.acceptGameTransferInvitation(slug, recipientUid, at);
  }

  async cancelGameTransferInvitation(
    slug: string,
    senderUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    return this.gameTransferStore.cancelGameTransferInvitation(slug, senderUid, at);
  }

  async rejectGameTransferInvitation(
    slug: string,
    recipientUid: string,
    at: string,
  ): Promise<GameTransferInvitation | null> {
    return this.gameTransferStore.rejectGameTransferInvitation(slug, recipientUid, at);
  }

  async listPendingGameTransfersForRecipient(uid: string, at: string): Promise<GameTransferInvitation[]> {
    return this.gameTransferStore.listPendingGameTransfersForRecipient(uid, at);
  }
}
