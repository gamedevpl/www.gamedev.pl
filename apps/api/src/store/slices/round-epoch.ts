// Which access revision a starting round belongs to.

import type { GameAccessRecord } from '../records/game-access.js';
import type { SubmissionRecord } from '../records/submission.js';

// The epoch a starting round takes, or undefined to leave it.

// Only the current owner's own round may take the current revision.

// A previous owner's round picking one up would revive its keys.
export function epochForRound(record: SubmissionRecord, access: GameAccessRecord | null): number | undefined {
  if (!access || record.accessEpoch !== undefined) return undefined;
  if (record.ownerUid !== access.ownerUid) return undefined;
  return access.accessRevision;
}
