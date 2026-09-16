import type { Firestore } from '@google-cloud/firestore';
import { preserveHandoverMarker } from './transfer-marker-backfill.js';

interface StoredInvite {
  senderUid?: string;
  recipientUid?: string;
  status?: string;
  respondedAt?: string;
}

// Drops the erased account's invitations, keeping what they prove.

// A slug-keyed doc can be overwritten first, so re-check it.

// Returns the recipients whose cached inbox lost a row.
export async function eraseTransferRows(db: Firestore, uid: string, slugs: Iterable<string>): Promise<Set<string>> {
  const affectedRecipients = new Set<string>();
  for (const slug of slugs) {
    const ref = db.collection('gameTransfers').doc(slug);

    // Deleting this row erases the only record of a handover.
    const invite = (await ref.get()).data() as StoredInvite | undefined;
    if (invite && (invite.senderUid === uid || invite.recipientUid === uid)) {
      await preserveHandoverMarker(db, slug, invite);
    }
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const current = snap.data() as StoredInvite;
      if (current.senderUid !== uid && current.recipientUid !== uid) return;
      tx.delete(ref);
      if (current.recipientUid) affectedRecipients.add(current.recipientUid);
    });
  }
  return affectedRecipients;
}
