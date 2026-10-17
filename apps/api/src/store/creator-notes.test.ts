import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import { CreatorNotesConflict } from './slices/creator-notes.js';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

const notes = (text: string, roundGeneration = 1, uid = 'g:owner', jobId = 7) => ({
  uid,
  text,
  updatedAt: '2026-10-17T00:00:00.000Z',
  jobId,
  roundGeneration,
});

for (const [name, makeStore] of IMPLEMENTATIONS) {
  describe(`creator notes: ${name}`, () => {
    it('replaces the job owner’s notes and shares them across their games', async () => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      await store.createSubmission(8, 'g:owner', 'Comets');
      expect(await store.getCreatorNotes('g:owner')).toBeNull();
      expect(await store.setCreatorNotes(notes('likes neon'), 0)).toBe(1);
      expect(await store.setCreatorNotes(notes('likes neon, hates timers', 1, 'g:owner', 8), 1)).toBe(2);
      expect(await store.getCreatorNotes('g:owner')).toMatchObject({
        text: 'likes neon, hates timers',
        jobId: 8,
        revision: 2,
      });
    });

    it('refuses a write based on notes another round already replaced', async () => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      await store.createSubmission(8, 'g:owner', 'Comets');
      await store.setCreatorNotes(notes('from rocks'), 0);
      const conflict = await store.setCreatorNotes(notes('from comets', 1, 'g:owner', 8), 0).catch((error) => error);
      expect(conflict).toBeInstanceOf(CreatorNotesConflict);
      expect(conflict.current).toMatchObject({ text: 'from rocks', revision: 1 });
      expect(await store.getCreatorNotes('g:owner')).toMatchObject({ text: 'from rocks' });
    });

    it('refuses a stale round, another creator and an unknown job', async () => {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      await store.bumpRoundGeneration(7);
      await expect(store.setCreatorNotes(notes('old', 1), 0)).rejects.toThrow(/no longer current/);
      await expect(store.setCreatorNotes(notes('x', 2, 'g:someone'), 0)).rejects.toThrow(/another creator/);
      await expect(store.setCreatorNotes(notes('x', 1, 'g:owner', 99), 0)).rejects.toThrow(/no longer current/);
      expect(await store.getCreatorNotes('g:someone')).toBeNull();
    });
  });
}

describe('creator notes and account erasure', () => {
  it('deletes the creator’s notes with their account', async () => {
    const store = new InMemoryStore();
    await store.upsertUser({ uid: 'g:owner' });
    await store.createSubmission(7, 'g:owner', 'Rocks');
    await store.setCreatorNotes(notes('likes neon'), 0);

    await store.deleteAccountIdentity('g:owner', '2026-10-18T00:00:00.000Z');

    expect(await store.getCreatorNotes('g:owner')).toBeNull();
  });
});
