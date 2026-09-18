import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';
import { hasPendingInbox, queuesCreatorInbox, writePendingInboxFlag } from './pending-inbox-flag.js';

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
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBe(false);

    const first = await store.appendCreatorMessage(9, 'faster');
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBe(true);
    expect(hasPendingInbox(await store.listPendingCreatorMessages(9))).toBe(true);

    await store.markCreatorMessagesDelivered(9, [first.id]);
    expect((await store.getSubmission(9))?.pendingCreatorMessage).toBe(false);
    expect(await store.listPendingCreatorMessages(9)).toEqual([]);
  });

  it('stampEmpty writes false only when the inbox is empty', async () => {
    const store = new InMemoryStore();
    await store.appendCreatorMessage(4, 'nudge');
    await store.listPendingCreatorMessages(4, { stampEmpty: true });
    expect((await store.getSubmission(4))?.pendingCreatorMessage).toBe(true);

    const storeEmpty = new InMemoryStore();
    await storeEmpty.createSubmission(5, 'g:owner', 'Empty');
    await storeEmpty.listPendingCreatorMessages(5, { stampEmpty: true });
    expect((await storeEmpty.getSubmission(5))?.pendingCreatorMessage).toBe(false);
  });

  it('round-trips the flag on the fake Firestore store', async () => {
    const store = new FirestoreStore(fakeFirestore().db);
    await store.createSubmission(8, 'g:owner', 'Sky');
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBe(false);
    const first = await store.appendCreatorMessage(8, 'faster');
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBe(true);
    await store.markCreatorMessagesDelivered(8, [first.id]);
    expect((await store.getSubmission(8))?.pendingCreatorMessage).toBe(false);
  });

  it('probe false does not clobber a concurrent true', async () => {
    const { db } = fakeFirestore();
    await db.collection('submissions').doc('7').set({ pendingCreatorMessage: true });
    await writePendingInboxFlag(db, 7, false);
    expect((await db.collection('submissions').doc('7').get()).data()?.pendingCreatorMessage).toBe(true);
  });
});
