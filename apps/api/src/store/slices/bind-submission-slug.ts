import { permitsRecoveryClaim, type RecoveryAdmission } from './recovery-admission.js';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import { isActiveBuildRound } from '../../creation/job-state.js';
import { fromStoredSubmission, type SubmissionRecord } from '../records/submission.js';

export function assertRecoveryBinding(
  jobId: number,
  holder?: SubmissionRecord,
  admission?: RecoveryAdmission,
  admissionNonce?: string,
): void {
  if (
    holder?.jobId !== jobId &&
    (!permitsRecoveryClaim(admission, admissionNonce) || (holder?.recoveryKey && isActiveBuildRound(holder)))
  )
    throw Object.assign(new Error('The game has an active recovery round. Refresh before continuing.'), {
      statusCode: 409,
    });
}
export async function bindSubmissionSlug(
  db: GuardedFirestore,
  jobId: number,
  slug: string,
  admissionNonce?: string,
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const rows = await tx.get(db.collection('submissions').where('slug', '==', slug));
    const claim = db.collection('games').doc(slug);
    const game = await tx.get(claim);
    const holder = rows.docs
      .map((d) => fromStoredSubmission(d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId)[0];
    assertRecoveryBinding(jobId, holder, game.data()?.recoveryAdmission, admissionNonce);
    tx.set(claim, { slugClaimJobId: jobId }, { merge: true });
    tx.set(db.collection('submissions').doc(String(jobId)), { slug }, { merge: true });
  });
}
