import type { PublicationStore } from './publication.js';
import type { SubmissionStatus } from '../../platform/submission-status.js';
import type { LocalActivity } from '@gamedevpl/contract';
import type { SubmissionRecord } from '../records/submission.js';
import type { SubmissionStore } from './submission.js';
export class InMemorySubmissionStore implements SubmissionStore {
  constructor(
    private submissions: Map<number, SubmissionRecord>,
    private publication?: Pick<PublicationStore, 'getPublication'>,
  ) {}

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

  async setLocalActivity(jobId: number, activity: LocalActivity, start: boolean): Promise<boolean> {
    const sub = this.submissions.get(jobId);
    if (
      !sub ||
      (!start &&
        (sub.localActivity?.runId !== activity.runId || sub.localActivity.generation !== (sub.roundGeneration ?? 0)))
    )
      return false;
    this.submissions.set(jobId, { ...sub, localActivity: { ...activity, generation: sub.roundGeneration ?? 0 } });
    return true;
  }

  async claimSubmissionSlug(
    jobId: number,
    slug: string,
    sourceJobId: number | null,
    recovery?: { key: string; spec: string; locale: string },
  ): Promise<boolean> {
    if (await this.publication?.getPublication(slug)) return false;
    const target = this.submissions.get(jobId);
    const records = [...this.submissions.values()].filter((r) => r.slug === slug);
    const holder = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId)[0];
    if (!target || target.slug) return false;
    if (
      sourceJobId === null
        ? records.length > 0
        : !holder ||
          holder.jobId !== sourceJobId ||
          holder.ownerUid !== target.ownerUid ||
          holder.state !== 'canceled' ||
          holder.moderationBlockedAt
    )
      return false;
    this.submissions.set(jobId, {
      ...target,
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

  async setModerationBlocked(jobId: number, at: string | null): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (!sub) return;
    const next = { ...sub };
    if (at) next.moderationBlockedAt = at;
    else delete next.moderationBlockedAt;
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

  async setSubmissionDispatchBrief(jobId: number, brief: string): Promise<void> {
    const sub = this.submissions.get(jobId);
    if (sub) this.submissions.set(jobId, { ...sub, dispatchBrief: brief });
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
