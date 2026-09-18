import type { Firestore } from '@google-cloud/firestore';
import type { CreatorMessage, CreatorMessageOrigin } from '../records/build-log.js';
import { isStudioOrigin } from '../records/build-log.js';
import type { SubmissionRecord } from '../records/submission.js';

export function queuesCreatorInbox(opts?: { delivered?: boolean; origin?: CreatorMessageOrigin }): boolean {
  return !opts?.delivered && !isStudioOrigin(opts?.origin);
}

export function hasPendingInbox(messages: readonly CreatorMessage[]): boolean {
  return messages.some((message) => !message.deliveredAt && !isStudioOrigin(message.origin));
}

export function setLocalPendingInboxFlag(
  submissions: Map<number, SubmissionRecord>,
  jobId: number,
  pending: boolean,
): void {
  const current = submissions.get(jobId);
  if (!current) return;
  submissions.set(jobId, { ...current, pendingCreatorMessage: pending });
}

export async function writePendingInboxFlag(db: Firestore, jobId: number, pending: boolean): Promise<void> {
  const ref = db.collection('submissions').doc(String(jobId));
  if (pending) {
    await ref.set({ pendingCreatorMessage: true }, { merge: true });
    return;
  }
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if ((snap.data() as { pendingCreatorMessage?: boolean } | undefined)?.pendingCreatorMessage === true) return;
    tx.set(ref, { pendingCreatorMessage: false }, { merge: true });
  });
}

export async function clearPendingInboxFlag(db: Firestore, jobId: number): Promise<void> {
  await db.collection('submissions').doc(String(jobId)).set({ pendingCreatorMessage: false }, { merge: true });
}
