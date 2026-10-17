import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

const notes = (text: string, roundGeneration = 1, slug = 'rocks') => ({
  slug,
  text,
  updatedAt: '2026-10-17T00:00:00.000Z',
  jobId: 7,
  roundGeneration,
});

for (const [name, makeStore] of IMPLEMENTATIONS) {
  describe(`builder notes: ${name}`, () => {
    async function game(): Promise<Store> {
      const store = makeStore();
      await store.createSubmission(7, 'g:owner', 'Rocks');
      await store.setSubmissionSlug(7, 'rocks');
      return store;
    }

    it('replaces the notes of the job’s own game and reads them back', async () => {
      const store = await game();
      expect(await store.getBuilderNotes('rocks')).toBeNull();
      await store.setBuilderNotes(notes('first'));
      await store.setBuilderNotes(notes('second'));
      expect(await store.getBuilderNotes('rocks')).toMatchObject({ text: 'second', jobId: 7 });
      await store.clearBuilderNotes('rocks');
      expect(await store.getBuilderNotes('rocks')).toBeNull();
    });

    it('refuses a stale round, another game and an unknown job', async () => {
      const store = await game();
      await store.bumpRoundGeneration(7);
      await expect(store.setBuilderNotes(notes('old', 1))).rejects.toThrow(/no longer current/);
      await expect(store.setBuilderNotes(notes('x', 2, 'other'))).rejects.toThrow(/different game/);
      await expect(store.setBuilderNotes({ ...notes('x'), jobId: 99 })).rejects.toThrow(/no longer current/);
      expect(await store.getBuilderNotes('other')).toBeNull();
    });
  });
}

describe('builder notes and game transfer', () => {
  it('clears the sender’s notes when the game changes hands', async () => {
    const store = new InMemoryStore();
    await store.ensureGameAccess('rocks', 'g:ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    await store.upsertUser({ uid: 'g:grace' });
    await store.createSubmission(7, 'g:ada', 'Rocks');
    await store.setSubmissionSlug(7, 'rocks');
    await store.setBuilderNotes(notes('ada’s notes'));
    const invite = await store.createGameTransferInvitation('rocks', 'g:ada', 'g:grace', 1, '2026-01-01T00:00:00.000Z');
    if (typeof invite === 'string' || !invite) throw new Error('no invite');

    await store.acceptGameTransferInvitation('rocks', 'g:grace', '2026-01-02T00:00:00.000Z', invite.invitationId);

    expect(await store.getBuilderNotes('rocks')).toBeNull();
  });
});
