import type { Firestore } from '@google-cloud/firestore';
import { isRoundOpen } from '../platform/sweep-scope.js';
import { fromStoredSubmission } from './records/submission.js';

const MARKER_DOC = 'openRoundBackfill';

// Firestore's ceiling is 500; the erase path keeps the same headroom.
const BATCH_SIZE = 450;

// How often the tail is re-checked after the first full pass.
export const OPEN_ROUND_RESCAN_INTERVAL_MS = 10 * 60_000;

// Overlap, so a create straddling a pass boundary is seen.
const RESCAN_OVERLAP_MS = 5 * 60_000;

// Never once-ever: a rollback serves code writing no flag.
export async function backfillOpenRound(db: Firestore, now: () => number = Date.now): Promise<number> {
  const marker = db.collection('counters').doc(MARKER_DOC);
  const stored = (await marker.get()).data() as { at?: string } | undefined;
  const lastPass = stored?.at ? Date.parse(stored.at) : Number.NaN;
  const startedAt = new Date(now()).toISOString();

  // An unparseable or absent marker means a full pass.
  const everRan = !Number.isNaN(lastPass);
  if (everRan && now() - lastPass < OPEN_ROUND_RESCAN_INTERVAL_MS) return 0;

  const since = everRan ? new Date(lastPass - RESCAN_OVERLAP_MS).toISOString() : null;
  const query = since ? db.collection('submissions').where('createdAt', '>=', since) : db.collection('submissions');
  const snap = await query.get();
  const stale = snap.docs.filter((doc) => (doc.data() as { openRound?: boolean }).openRound === undefined);

  for (let start = 0; start < stale.length; start += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of stale.slice(start, start + BATCH_SIZE)) {
      batch.set(doc.ref, { openRound: isRoundOpen(fromStoredSubmission(doc.data())) }, { merge: true });
    }
    await batch.commit();
  }

  // From the pass start, so a create during it is re-checked.
  await marker.set({ at: startedAt, stamped: stale.length, scanned: snap.docs.length });
  return stale.length;
}
