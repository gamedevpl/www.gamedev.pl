import type { GameAccessRecord } from './records/game-access.js';
import type { SubmissionRecord } from './records/submission.js';

export function countCanonicalSubmissions(
  ownerUid: string,
  submissions: Iterable<SubmissionRecord>,
  accessMap: Map<string, GameAccessRecord>,
): number {
  const canonicalSlugs = new Set([...accessMap.values()].filter((a) => a.ownerUid === ownerUid).map((a) => a.slug));
  let count = 0;
  for (const record of submissions) {
    if (record.slug && canonicalSlugs.has(record.slug)) {
      count++;
    } else if (record.ownerUid === ownerUid) {
      if (!record.slug || !accessMap.has(record.slug)) {
        count++;
      }
    }
  }
  return count;
}
