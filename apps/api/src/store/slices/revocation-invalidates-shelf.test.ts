// Revoking membership must invalidate the removed editor's shelf document.

import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';

const implementations: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
];

async function sharedGame(store: Store, at: string): Promise<void> {
  await store.upsertUser({ uid: 'g:owner' });
  await store.upsertUser({ uid: 'g:editor' });
  await store.ensureGameAccess('sky-dodge', 'g:owner', at, at);
  const invite = await store.createEditorInvitation('sky-dodge', 'g:owner', 'g:editor', at);
  await store.acceptEditorInvitation('sky-dodge', 'g:editor', at, (invite as { inviteId: string }).inviteId);
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, 'g:editor', 'Round');
  await store.setSubmissionSlug(jobId, 'sky-dodge');
}

for (const [name, make] of implementations)
  describe(`${name}: revocation invalidates the shelf`, () => {
    // Rebuild and fallback are both best effort; one wobble takes both.
    it('invalidates even when the rebuild and its fallback both fail', async () => {
      const store = make();
      const at = new Date().toISOString();
      await sharedGame(store, at);

      await store.rebuildShelf('g:editor');
      const served = await store.getShelf('g:editor');
      expect(served?.stale).toBeUndefined();
      expect(served?.rounds.length).toBeGreaterThan(0);

      vi.spyOn(store, 'listSubmissionsByOwner').mockRejectedValue(new Error('firestore is having a day'));
      vi.spyOn(store, 'tombstoneShelf').mockRejectedValue(new Error('firestore is still having a day'));

      expect(await store.removeEditor('sky-dodge', 'g:owner', 'g:editor', at)).toMatchObject({
        ownerUid: 'g:owner',
      });

      const after = await store.getShelf('g:editor');
      expect(after?.stale).toBe(true);
      expect(after?.rounds).toEqual([]);
      // Advanced, so an earlier pass cannot win.
      expect(after?.seq ?? 0).toBeGreaterThan(served?.seq ?? 0);
      vi.restoreAllMocks();
    });

    it('does the same when the editor leaves of their own accord', async () => {
      const store = make();
      const at = new Date().toISOString();
      await sharedGame(store, at);
      await store.rebuildShelf('g:editor');
      vi.spyOn(store, 'listSubmissionsByOwner').mockRejectedValue(new Error('firestore is having a day'));
      vi.spyOn(store, 'tombstoneShelf').mockRejectedValue(new Error('firestore is still having a day'));

      expect(await store.leaveGame('sky-dodge', 'g:editor', at)).toMatchObject({ ownerUid: 'g:owner' });

      expect((await store.getShelf('g:editor'))?.stale).toBe(true);
      vi.restoreAllMocks();
    });
  });
