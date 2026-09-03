import type { Firestore } from '@google-cloud/firestore';
import { isRoundOpen } from '../platform/sweep-scope.js';
import { fromStoredSubmission } from './records/submission.js';

const MARKER_DOC = 'openRoundBackfill';

// Firestore's ceiling is 500; the erase path keeps the same headroom.
const BATCH_SIZE = 450;

// Stamps openRound on documents written before the field existed.
export async function backfillOpenRound(db: Firestore): Promise<number> {
  const marker = db.collection('counters').doc(MARKER_DOC);
  if ((await marker.get()).exists) return 0;

  const snap = await db.collection('submissions').get();
  const stale = snap.docs.filter((doc) => (doc.data() as { openRound?: boolean }).openRound === undefined);

  for (let start = 0; start < stale.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of stale.slice(start, start + BATCH_SIZE)) {
      batch.set(doc.ref, { openRound: isRoundOpen(fromStoredSubmission(doc.data())) }, { merge: true });
    }
    await batch.commit();
  }

  // Written last, so a crash mid-pass makes the next query retry.
  await marker.set({ at: new Date().toISOString(), stamped: stale.length, scanned: snap.docs.length });
  return stale.length;
}
