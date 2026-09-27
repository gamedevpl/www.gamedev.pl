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

export function titleFromSubmission(record: SubmissionRecord): string {
  return record.title.trim() || record.slug || `issue-${record.jobId}`;
}

export async function refreshReviewCandidates(store: Store, items: ReviewQueueItem[]): Promise<ReviewQueueItem[]> {
  if (!items.length) return [];
  const candidates = new Map<string, SubmissionRecord>();
  for (const candidate of reviewableCreatorDrafts(await store.listSubmissionsWithDelivery())) {
    if (!candidates.has(candidate.slug!)) candidates.set(candidate.slug!, candidate);
  }
  return items.flatMap((item) => {
    const candidate = candidates.get(item.slug);
    if (item.source === 'catalog') return candidate ? [] : [item];
    return candidate
      ? [
          {
            ...item,
            title: titleFromSubmission(candidate),
            jobId: candidate.jobId,
            gameVersion: candidate.previewVersion ?? candidate.deliveredVersion ?? null,
          },
        ]
      : [];
  });
}
