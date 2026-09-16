// Which access revision a starting round belongs to.

import type { GameAccessRecord } from '../records/game-access.js';
import type { SubmissionRecord } from '../records/submission.js';

// The epoch a starting round takes, or undefined to leave it.

// Owner identity cannot decide this: A -> B -> A restores the uid, and

// an undelivered nudge reaches an old round without reminting its keys.

// Only a round begun after the last handover may take it.
export function epochForRound(record: SubmissionRecord, access: GameAccessRecord | null): number | undefined {
  if (!access || record.accessEpoch !== undefined) return undefined;
  const memberRevokedAt = access.memberRevocations?.[record.ownerUid]?.at;
  if (memberRevokedAt !== undefined && record.createdAt <= memberRevokedAt) return undefined;
  const revokedAt = access.capabilitiesRevokedAt;
  if (revokedAt !== undefined && record.createdAt <= revokedAt) return undefined;
  const currentBuilder = record.ownerUid === access.ownerUid || access.editorUids.includes(record.ownerUid);
  if (!currentBuilder) return undefined;
  return access.accessRevision;
}
