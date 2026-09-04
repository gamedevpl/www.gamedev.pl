// Whether a green preview may be promoted to a publish candidate. See the /seal route.

import type { SubmissionRecord } from '../store/records/submission.js';

// Refusals the seal route answers with; null means the record itself is eligible.
export type SealRefusal = 'not_reviewable' | 'already_delivered' | 'no_preview' | 'no_slug';

// Record-only, so the route and the status flag cannot disagree. The gate verdict is
// checked by the route: it costs a store read, and status builds on every poll.
export function sealRefusal(
  record: Pick<SubmissionRecord, 'state' | 'slug' | 'previewVersion' | 'deliveredVersion'>,
): SealRefusal | null {
  if (record.state !== 'ready_for_review') return 'not_reviewable';
  // Already publishable; sealing would duplicate it for nothing.
  if (record.deliveredVersion) return 'already_delivered';
  if (!record.slug) return 'no_slug';
  if (!record.previewVersion) return 'no_preview';
  return null;
}
