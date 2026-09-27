import { assertAgentRound } from './agent-round-write.js';
import type { DocumentReference } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';

export async function setShelfVisibleFields(
  db: GuardedFirestore,
  ref: DocumentReference,
  patch: Record<string, unknown>,
  generation?: number,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    assertAgentRound(snap.exists ? (snap.data() as SubmissionRecord) : undefined, generation);
    tx.set(ref, patch, { merge: true });
  });
}
