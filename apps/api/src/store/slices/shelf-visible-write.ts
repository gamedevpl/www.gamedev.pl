import type { DocumentReference } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';

export async function setShelfVisibleFields(
  db: GuardedFirestore,
  ref: DocumentReference,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    await tx.get(ref);
    tx.set(ref, patch, { merge: true });
  });
}
