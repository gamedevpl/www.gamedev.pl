import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';
import {
  hasPendingInbox,
  queuesCreatorInbox,
  writePendingInboxFlag,
  clearPendingInboxFlag,
} from './pending-inbox-flag.js';

const STORES: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

describe('pending inbox flag', () => {
  it('queues only undelivered non-studio rows', () => {
    expect(queuesCreatorInbox()).toBe(true);
    expect(queuesCreatorInbox({ delivered: true })).toBe(false);
    expect(queuesCreatorInbox({ origin: 'studio' })).toBe(false);
    expect(queuesCreatorInbox({ origin: 'agent' })).toBe(true);
  });

  it('stamps true on append and false once the inbox is empty', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(9, 'g:owner', 'Sky');
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBeUndefined();

    const first = await store.appendCreatorMessage(9, 'faster');
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBe(true);
    expect(hasPendingInbox(await store.listPendingCreatorMessages(9))).toBe(true);

    await store.markCreatorMessagesDelivered(9, [first.id]);
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBe(false);
    expect(await store.listPendingCreatorMessages(9)).toEqual([]);
  });

  it('stampEmpty writes false only when the inbox is empty', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(4, 'g:owner', 'Nudge');
    await store.appendCreatorMessage(4, 'nudge');
    await store.listPendingCreatorMessages(4, { stampEmpty: true });
    expect((await store.getSubmission(4))?.pendingCreatorMessage).toBe(true);

    const storeEmpty = new InMemoryStore();
    await storeEmpty.createSubmission(5, 'g:owner', 'Empty');
    await storeEmpty.listPendingCreatorMessages(5, { stampEmpty: true });
    expect((await storeEmpty.getSubmission(5))?.pendingCreatorMessage).toBe(false);
  });

  it('stampEmpty heals a leftover true after an empty scan', async () => {
    const { db } = fakeFirestore();
    await db.collection('submissions').doc('6').set({ pendingCreatorMessage: true });
    const fsStore = new FirestoreStore(db);
    await fsStore.listPendingCreatorMessages(6, { stampEmpty: true });
    expect((await db.collection('submissions').doc('6').get()).data()?.pendingCreatorMessage).toBe(false);
  });

  it('round-trips the flag on the fake Firestore store', async () => {
    const store = new FirestoreStore(fakeFirestore().db);
    await store.createSubmission(8, 'g:owner', 'Sky');
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBeUndefined();
    const first = await store.appendCreatorMessage(8, 'faster');
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBe(true);
    await store.markCreatorMessagesDelivered(8, [first.id]);
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBe(false);
  });

  it('stampEmpty restores true when a rollback row is waiting', async () => {
    const { db } = fakeFirestore();
    await db.collection('submissions').doc('6').set({ pendingCreatorMessage: false });
    await db.collection('submissions').doc('6').collection('messages').doc('m1').set({
      id: 'm1',
      text: 'from old revision',
      createdAt: '2026-09-18T00:00:00.000Z',
      deliveredAt: null,
    });
    const fsStore = new FirestoreStore(db);
    const pending = await fsStore.listPendingCreatorMessages(6, { stampEmpty: true });
    expect(pending).toHaveLength(1);
    expect((await db.collection('submissions').doc('6').get()).data()?.pendingCreatorMessage).toBe(true);
  });

  it('probe false does not clobber a concurrent true', async () => {
    const { db } = fakeFirestore();
    await db.collection('submissions').doc('7').set({ pendingCreatorMessage: true });
    await writePendingInboxFlag(db, 7, false);
    expect((await db.collection('submissions').doc('7').get()).data()?.pendingCreatorMessage).toBe(true);
  });

  it('does not create a submission parent when the job is missing', async () => {
    const { db } = fakeFirestore();
    await writePendingInboxFlag(db, 1, true);
    await writePendingInboxFlag(db, 1, false);
    await clearPendingInboxFlag(db, 1);
    expect((await db.collection('submissions').doc('1').get()).exists).toBe(false);

    const store = new FirestoreStore(db);
    await store.appendCreatorMessage(2, 'orphan');
    expect((await db.collection('submissions').doc('2').get()).exists).toBe(false);
    expect(await store.listPendingCreatorMessages(2)).toHaveLength(1);

    await store.markCreatorMessagesDelivered(3, ['ghost']);
    expect((await db.collection('submissions').doc('3').get()).exists).toBe(false);
  });

  // blocked() runs after the snapshot and before the proposal write.
  it.each(STORES)('%s keeps a concurrent inbox stamp across a proposal post', async (_name, makeStore) => {
    const store = makeStore();
    const proposal = { sourceRef: 'shot-a', version: 'v1', options: [] };
    const claim = { version: 'v1', claimedAt: '2026-09-18T12:00:00.000Z' };
    await store.createSubmission(11, 'g:owner', 'Parcel Run');
    await store.setSubmissionPreviewVersion(11, 'v1');
    await store.claimDreamRun(11, claim.version, claim.claimedAt, 1);
    let inbox: Promise<unknown> | undefined;
    expect(
      await store.appendProposalMessage(11, claim, 'Two directions.', {
        proposal,
        ownerUid: 'g:owner',
        roundGeneration: 1,
        blocked: () => {
          inbox = store.appendCreatorMessage(11, 'please jump');
          return false;
        },
      }),
    ).toEqual({ posted: expect.objectContaining({ proposal }) });
    await inbox;
    expect((await store.getSubmission(11))?.pendingCreatorMessage).toBe(true);
    expect((await store.listPendingCreatorMessages(11)).map((message) => message.text)).toEqual(['please jump']);
  });
});
