import { permitsRecoveryClaim } from './recovery-admission.js';
import type { Firestore } from '@google-cloud/firestore';
import { isActiveBuildRound } from '../../creation/job-state.js';
import { fromStoredSubmission, type SubmissionRecord } from '../records/submission.js';

export async function claimManualRoundSlug(
  db: Firestore,
  jobId: number,
  slug: string,
  sourceJobId: number,
  admissionNonce?: string,
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const target = await tx.get(db.collection('submissions').doc(String(jobId)));
    const rows = await tx.get(db.collection('submissions').where('slug', '==', slug));
    const claim = db.collection('games').doc(slug);
    const game = await tx.get(claim);
    if (
      !target.exists ||
      !permitsRecoveryClaim(game.data()?.recoveryAdmission, admissionNonce) ||
      !canClaimManualRound(
        fromStoredSubmission(target.data()!),
        rows.docs.map((d) => fromStoredSubmission(d.data())),
        sourceJobId,
        game.data()?.publication?.state,
      )
    )
      return false;
    tx.set(claim, { slugClaimJobId: jobId }, { merge: true });
    tx.update(db.collection('submissions').doc(String(jobId)), { slug });
    return true;
  });
}

export function canClaimManualRound(
  target: SubmissionRecord | undefined,
  records: SubmissionRecord[],
  sourceJobId: number,
  publicationState?: string,
): boolean {
  const ordered = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId);
  const latest = ordered[0];
  const holder = ordered.find((record) => !record.abandonedAt) ?? latest;
  if (!target || target.slug || !holder || !latest) return false;
  const expected =
    holder.jobId === sourceJobId ||
    (latest.jobId === sourceJobId && !!latest.abandonedAt && latest.ownerUid === target.ownerUid);
  return (
    expected &&
    holder.ownerUid === target.ownerUid &&
    !holder.moderationBlockedAt &&
    !latest.moderationBlockedAt &&
    !isActiveBuildRound(holder) &&
    !isActiveBuildRound(latest) &&
    publicationState !== 'disabled'
  );
}
