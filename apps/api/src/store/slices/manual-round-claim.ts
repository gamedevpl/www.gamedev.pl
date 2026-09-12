import type { Firestore } from '@google-cloud/firestore';
import { isActiveBuildRound } from '../../creation/job-state.js';
import { fromStoredSubmission } from '../records/submission.js';

export async function claimManualRoundSlug(
  db: Firestore,
  jobId: number,
  slug: string,
  sourceJobId: number,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const target = await tx.get(db.collection('submissions').doc(String(jobId)));
    const rows = await tx.get(db.collection('submissions').where('slug', '==', slug));
    const claim = db.collection('games').doc(slug);
    const game = await tx.get(claim);
    const holder = rows.docs
      .map((d) => fromStoredSubmission(d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId)[0];
    if (
      !target.exists ||
      target.data()?.slug ||
      !holder ||
      holder.jobId !== sourceJobId ||
      holder.ownerUid !== target.data()?.ownerUid ||
      holder.abandonedAt ||
      holder.moderationBlockedAt ||
      isActiveBuildRound(holder) ||
      game.data()?.publication?.state === 'disabled'
    )
      return false;
    tx.set(claim, { slugClaimJobId: jobId }, { merge: true });
    tx.update(db.collection('submissions').doc(String(jobId)), { slug });
    return true;
  });
}
