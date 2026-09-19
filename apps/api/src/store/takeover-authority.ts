import type { Transaction } from '@google-cloud/firestore';
import type { GuardedFirestore } from './shelf-guard-firestore.js';
import { classifyOwnerUid, deriveOwnerFromSubmissions } from '../platform/game-access-resolve.js';
import type { GameAccessRecord } from './records/game-access.js';
import { fromStoredSubmission, type SubmissionRecord } from './records/submission.js';

export function ownsTakeoverRound(
  sub: SubmissionRecord,
  uid: string,
  getAccess: (slug: string) => GameAccessRecord | null,
  getRounds: () => SubmissionRecord[],
): boolean {
  if (!sub.slug) return sub.ownerUid === uid;
  const access = getAccess(sub.slug);
  const owner = access
    ? classifyOwnerUid(access.ownerUid)
    : deriveOwnerFromSubmissions(
        getRounds()
          .filter((round) => round.slug === sub.slug)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId),
      );
  return owner.kind === 'creator' && owner.uid === uid;
}

export async function firestoreOwnsTakeoverRound(
  db: GuardedFirestore,
  tx: Transaction,
  sub: SubmissionRecord,
  uid: string,
): Promise<boolean> {
  if (!sub.slug) return sub.ownerUid === uid;
  // Read authority inside the mutation's transaction, including the legacy fallback.
  const snap = await tx.get(db.collection('gameAccess').doc(sub.slug));
  const access = snap.exists ? (snap.data() as GameAccessRecord) : null;
  const rounds = access
    ? []
    : (await tx.get(db.collection('submissions').where('slug', '==', sub.slug))).docs.map((doc) =>
        fromStoredSubmission(doc.data()),
      );
  return ownsTakeoverRound(
    sub,
    uid,
    () => access,
    () => rounds,
  );
}
