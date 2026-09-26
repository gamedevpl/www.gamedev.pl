import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

const at = '2026-09-15T00:00:00.000Z';
const stores: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
];

describe.each(stores)('takeover authority: %s', (_name, makeStore) => {
  async function setup() {
    const store = makeStore();
    await store.createSubmission(10, 'g:former', 'Game');
    await store.setSubmissionSlug(10, 'game');
    await store.setRoundBuilder(10, 'self');
    await store.ensureRoundGeneration(10);
    await store.recordDispatch(10, { backend: 'self', ref: 'waiting-agent' });
    return store;
  }

  it('uses canonical ownership even when the round records another actor', async () => {
    const store = await setup();
    await store.recordSettledOwner('game', 'g:current', 11, at, at);
    expect(await store.takeOverAgentRound(10, 'g:former', 1, at)).toBe(false);
    expect(await store.takeOverAgentRound(10, 'g:current', 2, at)).toBe(false);
    expect((await store.getSubmission(10))?.agentEndedAt).toBeUndefined();
    expect(await store.takeOverAgentRound(10, 'g:current', 1, at)).toBe(true);
    expect(await store.getSubmission(10)).toMatchObject({
      ownerUid: 'g:former',
      roundGeneration: 2,
      agentEndedAt: at,
      agentEndedBy: 'takeover',
    });
  });

  it.each(['bot:platform', 'platform:deleted-account'])('refuses platform ownership: %s', async (owner) => {
    const store = await setup();
    await store.recordSettledOwner('game', owner, 11, at, at);
    expect(await store.takeOverAgentRound(10, 'g:former', 1, at)).toBe(false);
    expect(await store.takeOverAgentRound(10, owner, 1, at)).toBe(false);
  });

  it('retains access for an unchanged owner', async () => {
    const store = await setup();
    expect(await store.takeOverAgentRound(10, 'g:stranger', 1, at)).toBe(false);
    expect(await store.takeOverAgentRound(10, 'g:former', 1, at)).toBe(true);
  });
});

it('reads canonical authority inside the Firestore takeover transaction', async () => {
  const { db } = fakeFirestore();
  const store = new FirestoreStore(db);
  await store.createSubmission(10, 'g:former', 'Game');
  await store.setSubmissionSlug(10, 'game');
  await store.setRoundBuilder(10, 'self');
  await store.recordDispatch(10, { backend: 'self', ref: 'waiting-agent' });
  const run = db.runTransaction.bind(db);
  const reads: string[] = [];
  vi.spyOn(db, 'runTransaction').mockImplementation((callback) =>
    run(async (tx) => {
      const get = tx.get.bind(tx);
      vi.spyOn(tx, 'get').mockImplementation((ref) => {
        reads.push('id' in ref ? String(ref.id) : 'query');
        return get(ref);
      });
      return callback(tx);
    }),
  );
  expect(await store.takeOverAgentRound(10, 'g:former', 1, at)).toBe(true);
  expect(reads).toEqual(['10', 'game']);
});

it('uses the newest live round for legacy games without GameAccess', async () => {
  const { db } = fakeFirestore();
  const store = new FirestoreStore(db);
  await store.createSubmission(10, 'g:former', 'Game');
  await store.setSubmissionSlug(10, 'game');
  await store.setRoundBuilder(10, 'self');
  await store.recordDispatch(10, { backend: 'self', ref: 'waiting-agent' });
  await store.createSubmission(11, 'g:current', 'Game');
  await store.setSubmissionSlug(11, 'game');
  await db.collection('gameAccess').doc('game').delete();
  expect(await store.takeOverAgentRound(10, 'g:former', 1, at)).toBe(false);
  expect(await store.takeOverAgentRound(10, 'g:current', 1, at)).toBe(true);
});
