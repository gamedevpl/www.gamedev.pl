import type { Firestore } from '@google-cloud/firestore';
import type { GameAccessRecord } from './records/game-access.js';
import { classifyOwnerUid } from '../platform/game-access-resolve.js';

const MARKER_DOC = 'transferMarkerBackfill';

// The owner-disagreement pass is a full scan, so it runs once.
const DEEP_MARKER_DOC = 'transferMarkerOwnerBackfill';

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
  for (const doc of accepted.docs) {
    const invite = doc.data() as { slug?: string; respondedAt?: string };
    if (!invite.slug) continue;
    if (await markHandover(db, invite.slug, invite.respondedAt)) stamped += 1;
  }

  stamped += await backfillFromOwnerDisagreement(db, startedAt);

  // From the pass start, so an accept during it is re-checked.
  await marker.set({ at: startedAt, stamped, scanned: accepted.docs.length });
  return stamped;
}

// Per record: an accept landing mid-pass writes the real time.
async function markHandover(db: Firestore, slug: string, at: string | undefined): Promise<boolean> {
  const ref = db.collection('gameAccess').doc(slug);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const access = snap.data() as GameAccessRecord;
    if (access.capabilitiesRevokedAtRevision !== undefined) return false;
    tx.set(ref, {
      ...access,
      capabilitiesRevokedAtRevision: access.accessRevision,
      capabilitiesRevokedAt: at ?? access.updatedAt,
    });
    return true;
  });
}

// A later offer overwrites the slug-keyed row, losing the accept.

// What survives is a round whose author is not the owner:

// the game was handed over, whatever the row says now.
async function backfillFromOwnerDisagreement(db: Firestore, startedAt: string): Promise<number> {
  const marker = db.collection('counters').doc(DEEP_MARKER_DOC);
  if ((await marker.get()).exists) return 0;

  const authors = new Map<string, Set<string>>();
  for (const doc of (await db.collection('submissions').get()).docs) {
    const row = doc.data() as { slug?: string; ownerUid?: string };
    if (!row.slug || !row.ownerUid) continue;
    const seen = authors.get(row.slug) ?? new Set<string>();
    seen.add(row.ownerUid);
    authors.set(row.slug, seen);
  }

  const access = await db.collection('gameAccess').get();
  let stamped = 0;
  for (const doc of access.docs) {
    const record = doc.data() as GameAccessRecord;
    if (record.capabilitiesRevokedAtRevision !== undefined) continue;

    // Erasure rewrites the owner uid, and a bot lane has no handover.
    if (classifyOwnerUid(record.ownerUid).kind !== 'creator') continue;
    const seen = authors.get(record.slug);
    if (!seen) continue;
    const handed = [...seen].some((uid) => uid !== record.ownerUid && classifyOwnerUid(uid).kind === 'creator');

    // The handover time is gone; the last write stands in.
    if (handed && (await markHandover(db, record.slug, record.updatedAt))) stamped += 1;
  }
  await marker.set({ at: startedAt, stamped, scanned: access.docs.length });
  return stamped;
}
