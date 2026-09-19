import { describe, expect, it } from 'vitest';
import { FirestoreStore } from '../platform/store.js';
import { roundAuthorityCurrent, resolveGameAccess } from '../platform/game-access-resolve.js';
import { fakeFirestore } from './fake-firestore.js';
import { TRANSFER_MARKER_RESCAN_INTERVAL_MS, backfillTransferMarkers } from './transfer-marker-backfill.js';

// A handover accepted before the marker existed leaves no marker behind.
async function seedBoomerang(db: ReturnType<typeof fakeFirestore>['db']) {
  await db
    .collection('gameAccess')
    .doc('sky-dodge')
    .set({
      slug: 'sky-dodge',
      ownerUid: 'g:ada',
      editorUids: [],
      memberUids: ['g:ada'],
      // Two handovers already happened; neither wrote a marker.
      accessRevision: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  await db.collection('gameTransfers').doc('sky-dodge').set({
    slug: 'sky-dodge',
    senderUid: 'g:grace',
    recipientUid: 'g:ada',
    status: 'accepted',
    accessRevision: 2,
    createdAt: '2026-01-31T00:00:00.000Z',
    expiresAt: '2026-02-07T00:00:00.000Z',
    respondedAt: '2026-02-01T00:00:00.000Z',
  });
}

describe('backfillTransferMarkers', () => {
  it('marks a game that changed hands before the field existed', async () => {
    const { db } = fakeFirestore();
    await seedBoomerang(db);

    expect(await backfillTransferMarkers(db)).toBe(1);

    const access = (await db.collection('gameAccess').doc('sky-dodge').get()).data();
    expect(access?.capabilitiesRevokedAtRevision).toBe(3);
    expect(access?.capabilitiesRevokedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('leaves a marker written by the accept path alone', async () => {
    const { db } = fakeFirestore();
    await seedBoomerang(db);
    await db
      .collection('gameAccess')
      .doc('sky-dodge')
      .set({ capabilitiesRevokedAtRevision: 2, capabilitiesRevokedAt: '2026-01-15T00:00:00.000Z' }, { merge: true });

    expect(await backfillTransferMarkers(db)).toBe(0);
    const access = (await db.collection('gameAccess').doc('sky-dodge').get()).data();
    expect(access?.capabilitiesRevokedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('does not rescan between intervals', async () => {
    const { db } = fakeFirestore();
    await seedBoomerang(db);
    await backfillTransferMarkers(db);

    expect(await backfillTransferMarkers(db)).toBe(0);
  });

  it('picks up a transfer a rolled-back revision accepted after the first pass', async () => {
    const { db } = fakeFirestore();
    let clock = Date.parse('2026-03-01T12:00:00.000Z');
    const now = () => clock;
    await backfillTransferMarkers(db, now);

    clock += TRANSFER_MARKER_RESCAN_INTERVAL_MS + 1;
    await seedBoomerang(db);

    expect(await backfillTransferMarkers(db, now)).toBe(1);
  });

  it('fences a pre-marker round once the game access read runs the pass', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await seedBoomerang(db);

    // A→B→A restored the uid, so an owner check admits this.
    const round = { ownerUid: 'g:ada' };
    const access = await resolveGameAccess(store, 'sky-dodge');

    expect(access.capabilitiesRevokedAtRevision).toBe(3);
    expect(roundAuthorityCurrent(round, access)).toBe(false);
  });
});

// A later offer replaced the accepted row on the same document.
async function seedOverwrittenHistory(db: ReturnType<typeof fakeFirestore>['db'], ownerUid = 'g:ada') {
  await db
    .collection('gameAccess')
    .doc('sky-dodge')
    .set({
      slug: 'sky-dodge',
      ownerUid,
      editorUids: [],
      memberUids: [ownerUid],
      accessRevision: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  await db.collection('gameTransfers').doc('sky-dodge').set({
    slug: 'sky-dodge',
    senderUid: ownerUid,
    recipientUid: 'g:pixel',
    status: 'cancelled',
    accessRevision: 3,
    createdAt: '2026-03-01T00:00:00.000Z',
    expiresAt: '2026-03-08T00:00:00.000Z',
    respondedAt: '2026-03-02T00:00:00.000Z',
  });
}

async function seedRound(db: ReturnType<typeof fakeFirestore>['db'], jobId: number, ownerUid: string) {
  await db
    .collection('submissions')
    .doc(String(jobId))
    .set({
      jobId,
      ownerUid,
      slug: 'sky-dodge',
      title: `round ${jobId}`,
      createdAt: '2026-01-05T00:00:00.000Z',
      lastStatus: 'published',
    });
}

describe('handovers whose invitation row was overwritten', () => {
  it('marks a game whose rounds name an author who is not the owner', async () => {
    const { db } = fakeFirestore();
    await seedOverwrittenHistory(db);
    await seedRound(db, 1, 'g:grace');
    await seedRound(db, 2, 'g:ada');

    expect(await backfillTransferMarkers(db)).toBe(1);

    const access = (await db.collection('gameAccess').doc('sky-dodge').get()).data();
    expect(access?.capabilitiesRevokedAtRevision).toBe(3);
    expect(access?.capabilitiesRevokedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('leaves a game whose rounds are all the owner alone', async () => {
    const { db } = fakeFirestore();
    await seedOverwrittenHistory(db);
    await seedRound(db, 1, 'g:ada');

    expect(await backfillTransferMarkers(db)).toBe(0);
    expect((await db.collection('gameAccess').doc('sky-dodge').get()).data()?.capabilitiesRevokedAt).toBeUndefined();
  });

  it('leaves a platform-owned lane alone, where authors differ without a handover', async () => {
    const { db } = fakeFirestore();
    await seedOverwrittenHistory(db, 'bot:repo-lane');
    await seedRound(db, 1, 'bot:other-lane');
    await seedRound(db, 2, 'g:ada');

    expect(await backfillTransferMarkers(db)).toBe(0);
  });

  it('marks the game before erasure deletes the invitation row', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await seedBoomerang(db);
    await store.upsertUser({ uid: 'g:grace' });

    // Erasure deletes the row and rewrites the rounds it authored.
    await store.deleteAccountIdentity('g:grace', '2026-04-01T00:00:00.000Z');

    expect((await db.collection('gameTransfers').doc('sky-dodge').get()).exists).toBe(false);
    const access = (await db.collection('gameAccess').doc('sky-dodge').get()).data();
    expect(access?.capabilitiesRevokedAtRevision).toBe(3);
    expect(access?.capabilitiesRevokedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('catches a handover a rolled-back revision accepted after a pass', async () => {
    const { db } = fakeFirestore();
    let clock = Date.parse('2026-03-01T12:00:00.000Z');
    const now = () => clock;
    await backfillTransferMarkers(db, now);

    // An old revision accepted without stamping, then hid the row.
    clock += TRANSFER_MARKER_RESCAN_INTERVAL_MS + 1;
    await seedOverwrittenHistory(db);
    await seedRound(db, 1, 'g:grace');

    expect(await backfillTransferMarkers(db, now)).toBe(1);
  });
});
