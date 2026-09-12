import type { SubmissionStore } from './slices/submission.js';
export abstract class SubmissionFacade {
  protected abstract submissionStore: SubmissionStore;
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
  async claimSubmissionSlug(
    jobId: number,
    slug: string,
    sourceJobId: number | null,
    recovery?: { key: string; spec: string; locale: string },
  ): Promise<boolean> {
    return this.submissionStore.claimSubmissionSlug(jobId, slug, sourceJobId, recovery);
  }
  async setSubmissionSlug(jobId: number, slug: string): Promise<void> {
    return this.submissionStore.setSubmissionSlug(jobId, slug);
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
}
