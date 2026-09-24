import type { DocumentReference } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
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

function flagOf(data: { pendingCreatorMessage?: boolean } | undefined): boolean | undefined {
  return data?.pendingCreatorMessage;
}

export function stampLocalInbox(submissions: Map<number, SubmissionRecord>, jobId: number, pendingCount: number): void {
  setLocalPendingInboxFlag(submissions, jobId, pendingCount > 0);
}

export async function stampListedInbox(
  db: GuardedFirestore,
  jobId: number,
  pendingCount: number,
  relist: () => Promise<readonly unknown[]>,
): Promise<void> {
  if (pendingCount === 0) await stampEmptyInbox(db, jobId, relist);
  else await writePendingInboxFlag(db, jobId, true);
}

export async function writePendingInboxFlag(db: GuardedFirestore, jobId: number, pending: boolean): Promise<void> {
  const ref = db.collection('submissions').doc(String(jobId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = flagOf(snap.data() as { pendingCreatorMessage?: boolean } | undefined);
    if (current === pending) return;
    if (!pending && current === true) return;
    tx.set(ref, { pendingCreatorMessage: pending }, { merge: true });
  });
}

// Heal leftover true: clear, then restore if a row landed.
export async function stampEmptyInbox(
  db: GuardedFirestore,
  jobId: number,
  relist: () => Promise<readonly unknown[]>,
): Promise<void> {
  const ref = db.collection('submissions').doc(String(jobId));
  const current = flagOf((await ref.get()).data() as { pendingCreatorMessage?: boolean } | undefined);
  if (current === true) {
    await clearPendingInboxFlag(db, jobId);
    if ((await relist()).length > 0) await writePendingInboxFlag(db, jobId, true);
    return;
  }
  // Already stamped: a transaction would re-read it only to write nothing.
  if (current === false) return;
  await writePendingInboxFlag(db, jobId, false);
}

export async function clearPendingInboxFlag(db: GuardedFirestore, jobId: number): Promise<void> {
  const ref = db.collection('submissions').doc(String(jobId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    tx.set(ref, { pendingCreatorMessage: false }, { merge: true });
  });
}

// Write the message; skip the flag when the parent is missing.
export async function queueInboxMessage(
  db: GuardedFirestore,
  jobId: number,
  messageRef: DocumentReference,
  record: CreatorMessage,
): Promise<void> {
  const parent = db.collection('submissions').doc(String(jobId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(parent);
    tx.set(messageRef, record);
    if (snap.exists) tx.set(parent, { pendingCreatorMessage: true }, { merge: true });
  });
}
