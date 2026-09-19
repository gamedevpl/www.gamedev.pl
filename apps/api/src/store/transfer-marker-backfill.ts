import type { Firestore } from '@google-cloud/firestore';
import type { GameAccessRecord } from './records/game-access.js';
import { classifyOwnerUid } from '../platform/game-access-resolve.js';

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

  // Every slug ever offered, not only the ones still reading accepted:

  // the next offer replaces the row, hiding an accept behind it.

  // The document itself is never deleted.
  const offered = await db.collection('gameTransfers').get();
  let stamped = 0;
  for (const doc of offered.docs) {
    const invite = doc.data() as { slug?: string; status?: string; respondedAt?: string };
    if (!invite.slug) continue;

    // A replaced accept leaves the rounds to say it happened.
    if (await preserveHandoverMarker(db, invite.slug, invite)) stamped += 1;
  }

  // From the pass start, so an accept during it is re-checked.
  await marker.set({ at: startedAt, stamped, scanned: offered.docs.length });
  return stamped;
}

// Erasure deletes the row and rewrites the rounds it authored,

// so the conclusion has to be drawn while the evidence is there.
export async function preserveHandoverMarker(
  db: Firestore,
  slug: string,
  invite: { status?: string; respondedAt?: string },
): Promise<boolean> {
  const access = await unmarkedAccess(db, slug);
  if (!access) return false;
  if (invite.status === 'accepted') return markHandover(db, slug, invite.respondedAt);
  if (!(await authorDisagrees(db, access))) return false;
  return markHandover(db, slug, access.updatedAt);
}

// Null when the game is marked, gone, or has no creator owner.
async function unmarkedAccess(db: Firestore, slug: string): Promise<GameAccessRecord | null> {
  const snap = await db.collection('gameAccess').doc(slug).get();
  if (!snap.exists) return null;
  const record = snap.data() as GameAccessRecord;
  if (record.capabilitiesRevokedAtRevision !== undefined) return null;

  // Erasure rewrites the owner uid, and a bot lane has no handover.
  return classifyOwnerUid(record.ownerUid).kind === 'creator' ? record : null;
}

// A round authored by someone else means a handover happened.
async function authorDisagrees(db: Firestore, access: GameAccessRecord): Promise<boolean> {
  const rounds = await db.collection('submissions').where('slug', '==', access.slug).get();
  return rounds.docs.some((doc) => {
    const uid = (doc.data() as { ownerUid?: string }).ownerUid;
    return uid !== undefined && uid !== access.ownerUid && classifyOwnerUid(uid).kind === 'creator';
  });
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
