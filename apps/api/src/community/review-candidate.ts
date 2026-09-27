import type { ReviewQueueItem } from './review-queue-cache.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

export function isReviewableCreatorDraft(record: SubmissionRecord): boolean {
  return Boolean(
    record.slug && record.deliveredVersion && record.draftSharedAt && !record.publishedAt && !record.abandonedAt,
  );
}

export function reviewableCreatorDrafts(records: SubmissionRecord[]): SubmissionRecord[] {
  return records
    .filter(isReviewableCreatorDraft)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.jobId - b.jobId);
}

export async function loadReviewCandidate(store: Store, slug: string): Promise<SubmissionRecord | null> {
  const siblings = await store.listSubmissionsBySlug(slug);
  return reviewableCreatorDrafts(siblings)[0] ?? null;
}

export async function refreshReviewCandidates(store: Store, items: ReviewQueueItem[]): Promise<ReviewQueueItem[]> {
  const refreshed = await Promise.all(
    items.map(async (item) => {
      const candidate = await loadReviewCandidate(store, item.slug);
      if (item.source === 'catalog') return candidate ? null : item;
      return candidate
        ? {
            ...item,
            jobId: candidate.jobId,
            gameVersion: candidate.previewVersion ?? candidate.deliveredVersion ?? null,
          }
        : null;
    }),
  );
  return refreshed.filter((item): item is ReviewQueueItem => item !== null);
}
