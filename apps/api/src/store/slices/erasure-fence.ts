// Erasure-fence reads inside a caller's transaction.

import type { Transaction } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import { erasedIncarnation } from '../records/game-access.js';

// The erased incarnation only; a later same-uid signup passes.
export async function erasedInTransaction(db: GuardedFirestore, tx: Transaction, uid: string): Promise<boolean> {
  const [user, fence] = await Promise.all([
    tx.get(db.collection('users').doc(uid)),
    tx.get(db.collection('erasedAccounts').doc(uid)),
  ]);
  const at = fence.exists ? ((fence.data() as { at?: string }).at ?? null) : null;
  return erasedIncarnation(user.exists ? (user.data() as { createdAt?: string }) : null, at);
}
