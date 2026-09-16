import type { Firestore } from '@google-cloud/firestore';
import type { GameAccessRecord } from './records/game-access.js';

const MARKER_DOC = 'transferMarkerBackfill';

// Re-checked: a rolled-back revision accepts transfers writing no marker.
export const TRANSFER_MARKER_RESCAN_INTERVAL_MS = 10 * 60_000;

// Only the new accept writer stamps the handover marker.

// An unmarked game falls back to comparing the owner uid,

// which a boomerang handover makes true again.
export async function backfillTransferMarkers(db: Firestore, now: () => number = Date.now): Promise<number> {
  const marker = db.collection('counters').doc(MARKER_DOC);
  const stored = (await marker.get()).data() as { at?: string } | undefined;
  const lastPass = stored?.at ? Date.parse(stored.at) : Number.NaN;
  const startedAt = new Date(now()).toISOString();

  // An unparseable or absent marker means a full pass.
  const everRan = !Number.isNaN(lastPass);
  if (everRan && now() - lastPass < TRANSFER_MARKER_RESCAN_INTERVAL_MS) return 0;

  const accepted = await db.collection('gameTransfers').where('status', '==', 'accepted').get();
  let stamped = 0;

  // Per record: an accept landing mid-pass writes the real time.
  for (const doc of accepted.docs) {
    const invite = doc.data() as { slug?: string; respondedAt?: string };
    if (!invite.slug) continue;
    const ref = db.collection('gameAccess').doc(invite.slug);
    const wrote = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const access = snap.data() as GameAccessRecord;
      if (access.capabilitiesRevokedAtRevision !== undefined) return false;
      const at = invite.respondedAt ?? access.updatedAt;
      tx.set(ref, { ...access, capabilitiesRevokedAtRevision: access.accessRevision, capabilitiesRevokedAt: at });
      return true;
    });
    if (wrote) stamped += 1;
  }

  // From the pass start, so an accept during it is re-checked.
  await marker.set({ at: startedAt, stamped, scanned: accepted.docs.length });
  return stamped;
}
