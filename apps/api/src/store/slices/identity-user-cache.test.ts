import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirestoreStore } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';
import { FirestoreIdentityStore } from './identity.js';

// The read floor: tier and blocks live here, window stays short.
function withUser(tier = 'standard') {
  const { db } = fakeFirestore();
  const store = new FirestoreIdentityStore(db);
  return {
    db,
    store,
    seed: async (fields: Record<string, unknown> = {}) =>
      db
        .collection('users')
        .doc('u1')
        .set({ uid: 'u1', createdAt: '2026-01-01T00:00:00Z', tier, ...fields }),
    // Writing behind the store makes a stale window visible.
    behindTheStore: async (fields: Record<string, unknown>) =>
      db
        .collection('users')
        .doc('u1')
        .set({ uid: 'u1', ...fields }, { merge: true }),
  };
}

describe('FirestoreIdentityStore user cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a repeat read from the window instead of Firestore', async () => {
    const { store, seed, behindTheStore } = withUser();
    await seed();
    expect((await store.getUser('u1'))?.tier).toBe('standard');

    await behindTheStore({ tier: 'blocked' });

    expect((await store.getUser('u1'))?.tier).toBe('standard');
  });

  it('re-reads once the window is over', async () => {
    const { store, seed, behindTheStore } = withUser();
    await seed();
    await store.getUser('u1');
    await behindTheStore({ tier: 'blocked' });

    vi.setSystemTime(new Date('2026-09-09T10:00:31Z'));

    expect((await store.getUser('u1'))?.tier).toBe('blocked');
  });

  // A write this instance made must never be answered from before it.
  it('drops the window on every write through the store', async () => {
    const { store, seed } = withUser();
    await seed();
    await store.getUser('u1');

    await store.upsertUser({ uid: 'u1', tier: 'blocked' });

    expect((await store.getUser('u1'))?.tier).toBe('blocked');
  });

  it('drops it on a profile edit, a deletion request and its cancellation', async () => {
    const { store, seed } = withUser();
    await seed({ handle: 'ada' });
    await store.getUser('u1');
    await store.updateCreatorProfile('u1', { profileName: 'Ada' });
    expect((await store.getUser('u1'))?.profileName).toBe('Ada');

    await store.scheduleAccountDeletion('u1', '2026-09-09T10:00:00Z', '2026-10-09T10:00:00Z');
    expect((await store.getUser('u1'))?.deletionScheduledFor).toBe('2026-10-09T10:00:00Z');

    await store.cancelAccountDeletion('u1');
    expect((await store.getUser('u1'))?.deletionScheduledFor).not.toBe('2026-10-09T10:00:00Z');
  });

  // The card's own opt-out reads back through this window.
  it('drops it on each notification switch', async () => {
    const { store, seed } = withUser();
    await seed();
    await store.getUser('u1');

    await store.setProposalsMuted('u1', '2026-09-09T10:00:00Z');
    expect((await store.getUser('u1'))?.proposalsMutedAt).toBe('2026-09-09T10:00:00Z');

    await store.setEmailUnsubscribed('u1', '2026-09-09T10:00:01Z');
    expect((await store.getUser('u1'))?.emailUnsubscribedAt).toBe('2026-09-09T10:00:01Z');

    await store.setDigestOptOut('u1', '2026-09-09T10:00:02Z');
    expect((await store.getUser('u1'))?.digestOptOutAt).toBe('2026-09-09T10:00:02Z');

    // Turning it back on must be visible too, not only off.
    await store.setProposalsMuted('u1', null);
    expect((await store.getUser('u1'))?.proposalsMutedAt).toBeNull();
  });

  // Paid checkpoints cannot trust another instance's window.
  it('reads the proposals mute past the window', async () => {
    const { store, seed, behindTheStore } = withUser();
    await seed();
    await store.getUser('u1');

    await behindTheStore({ proposalsMutedAt: '2026-09-09T10:00:00Z' });

    expect((await store.getUser('u1'))?.proposalsMutedAt).toBeUndefined();
    expect(await store.readProposalsMutedAt('u1')).toBe('2026-09-09T10:00:00Z');
  });

  it('hands out copies, so a caller cannot edit what the next request reads', async () => {
    const { store, seed } = withUser();
    await seed();
    const first = await store.getUser('u1');
    first!.tier = 'admin';

    expect((await store.getUser('u1'))?.tier).toBe('standard');
  });

  // Caching a missing user would hide a fresh sign-up.
  it('never caches a missing user', async () => {
    const { store, seed } = withUser();
    expect(await store.getUser('u1')).toBeNull();

    await seed();

    expect((await store.getUser('u1'))?.uid).toBe('u1');
  });

  // A read in flight must not restore what a write removed.
  it('does not repopulate from a read that started before the write', async () => {
    const { db } = fakeFirestore();
    await db.collection('users').doc('u1').set({ uid: 'u1', tier: 'standard' });

    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const users = db.collection('users');
    const slow = {
      ...db,
      collection: (name: string) =>
        name === 'users'
          ? {
              ...users,
              doc: (id: string) => ({ ...users.doc(id), get: async () => (await held, users.doc(id).get()) }),
            }
          : db.collection(name),
    } as unknown as typeof db;
    const slowStore = new FirestoreIdentityStore(slow);

    const inFlight = slowStore.getUser('u1');
    slowStore.forgetUser('u1');
    release();
    await inFlight;

    await db.collection('users').doc('u1').set({ uid: 'u1', tier: 'blocked' });
    expect((await slowStore.getUser('u1'))?.tier).toBe('blocked');
  });

  // Erasure reads the user first, seeding the window it outlives.
  it('forgets an erased account instead of authenticating it for another window', async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore(db);
    await db.collection('users').doc('u1').set({ uid: 'u1', tier: 'standard' });
    expect((await store.getUser('u1'))?.uid).toBe('u1');

    await store.deleteAccountIdentity('u1', '2026-09-09T10:00:00Z');

    expect(await store.getUser('u1')).toBeNull();
  });
});
