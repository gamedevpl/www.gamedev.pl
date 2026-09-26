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
  return reviewableCreatorDrafts(siblings)[0] ?? siblings.find((record) => !record.abandonedAt) ?? null;
}
