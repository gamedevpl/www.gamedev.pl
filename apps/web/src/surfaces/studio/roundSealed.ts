import type { SubmissionStatus } from '../../submissionApi.js';

// Past the point where a round still accepts edits.

// `status` is the coarse public state; `phase` is the finer job state.

// Both can carry the seal, so both are asked.
export function isRoundSealed(status: Pick<SubmissionStatus, 'status' | 'phase'> | null | undefined): boolean {
  if (!status) return false;
  return (
    status.status === 'in_review' ||
    status.status === 'published' ||
    status.phase === 'ready_for_review' ||
    status.phase === 'published'
  );
}
