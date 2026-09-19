// Revoking membership must invalidate the removed editor's shelf document.

import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { fakeFirestore } from '../fake-firestore.js';

// The public API creates the canonical row eagerly; legacy slugs lack one.
type Made = { store: Store; wipeAccess: (slug: string) => Promise<void> };
const implementations: Array<[string, () => Made]> = [
  [
    'memory',
    () => {
      const store = new InMemoryStore();
      const access = (store as unknown as { gameAccessStore: { access: Map<string, unknown> } }).gameAccessStore.access;
      return { store, wipeAccess: async (slug) => void access.delete(slug) };
    },
  ],
  [
    'firestore',
    () => {
      const fake = fakeFirestore();
      return {
        store: new FirestoreStore(fake.db),
        wipeAccess: async (slug) => void (await fake.db.collection('gameAccess').doc(slug).delete()),
      };
    },
  ],
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
      const { store } = make();
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

    // Two authors, no canonical row: both see it, derived.
    async function legacyTwoAuthorSlug({ store, wipeAccess }: Made): Promise<void> {
      await store.upsertUser({ uid: 'g:first' });
      await store.upsertUser({ uid: 'g:second' });
      for (const [uid, title] of [
        ['g:first', 'Round one'],
        ['g:second', 'Round two'],
      ] as const) {
        const jobId = await store.allocateJobId();
        await store.createSubmission(jobId, uid, title);
        await store.setSubmissionSlug(jobId, 'legacy-sky');
        // setSubmissionSlug creates the canonical row eagerly; this is history.
        await wipeAccess('legacy-sky');
      }
      expect(await store.getGameAccess('legacy-sky')).toBeNull();
      await store.rebuildShelf('g:second');
      expect((await store.getShelf('g:second'))?.stale).toBeUndefined();
      expect((await store.getShelf('g:second'))?.rounds.length).toBeGreaterThan(0);
    }

    // Going canonical strips the other author; their own count does not move.
    it('invalidates other legacy authors when ensureGameAccess creates the first row', async () => {
      const made = make();
      const { store } = made;
      const at = new Date().toISOString();
      await legacyTwoAuthorSlug(made);
      const ownedBySecond = await store.countSubmissionsByOwner('g:second');

      await store.ensureGameAccess('legacy-sky', 'g:first', at, at);

      expect(await store.countSubmissionsByOwner('g:second')).toBe(ownedBySecond);
      expect((await store.getShelf('g:second'))?.stale).toBe(true);
    });

    it('invalidates other legacy authors when settlement creates the first row', async () => {
      const made = make();
      const { store } = made;
      const at = new Date().toISOString();
      await legacyTwoAuthorSlug(made);

      expect(await store.recordSettledOwner('legacy-sky', 'g:first', 1, at, at)).toMatchObject({ ownerUid: 'g:first' });

      expect((await store.getShelf('g:second'))?.stale).toBe(true);
    });

    it('invalidates other legacy authors when the backfill creates the first row', async () => {
      const made = make();
      const { store } = made;
      const at = new Date().toISOString();
      await legacyTwoAuthorSlug(made);

      expect(await store.backfillGameAccess('legacy-sky', 'g:first', 1, at, false, at)).toMatchObject({
        ownerUid: 'g:first',
      });

      expect((await store.getShelf('g:second'))?.stale).toBe(true);
    });

    // A fresh single-author game has nobody else to invalidate.
    it('leaves a lone author alone when their own new game goes canonical', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:solo' });
      const jobId = await store.allocateJobId();
      await store.createSubmission(jobId, 'g:solo', 'Only mine');
      await store.setSubmissionSlug(jobId, 'solo-sky');
      await store.rebuildShelf('g:solo');
      const before = await store.getShelf('g:solo');

      await store.ensureGameAccess('solo-sky', 'g:solo', at, at);

      expect((await store.getShelf('g:solo'))?.seq).toBe(before?.seq);
    });

    // Leaving cancels their round; the tip changes for all.
    it('invalidates the remaining members when a leave cancels a round', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await sharedGame(store, at);
      await store.rebuildShelf('g:owner');
      expect((await store.getShelf('g:owner'))?.stale).toBeUndefined();
      const ownedByOwner = await store.countSubmissionsByOwner('g:owner');
      vi.spyOn(store, 'listSubmissionsByOwner').mockRejectedValue(new Error('firestore is having a day'));
      vi.spyOn(store, 'tombstoneShelf').mockRejectedValue(new Error('firestore is still having a day'));

      expect(await store.leaveGame('sky-dodge', 'g:editor', at)).toMatchObject({ ownerUid: 'g:owner' });

      // The owner's count did not move; only this says so.
      vi.restoreAllMocks();
      expect(await store.countSubmissionsByOwner('g:owner')).toBe(ownedByOwner);
      expect((await store.getShelf('g:owner'))?.stale).toBe(true);
    });

    // Another's round moves no count of the editor's own.
    it('invalidates a co-editor when a round lands on a shared game', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await sharedGame(store, at);

      // The editor has a shelf holding the shared game.
      await store.rebuildShelf('g:editor');
      const before = await store.getShelf('g:editor');
      expect(before?.stale).toBeUndefined();
      const ownedByEditor = await store.countSubmissionsByOwner('g:editor');

      // The owner adds a round the editor did not write.
      const newer = await store.allocateJobId();
      await store.createSubmission(newer, 'g:owner', 'Newer round');
      await store.setSubmissionSlug(newer, 'sky-dodge');

      // Their own count is unchanged, so only the document can say so.
      expect(await store.countSubmissionsByOwner('g:editor')).toBe(ownedByEditor);
      expect((await store.getShelf('g:editor'))?.stale).toBe(true);
    });

    // The loser keeps serving the name otherwise.
    it('invalidates the loser when settlement moves the canonical owner', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:first' });
      await store.upsertUser({ uid: 'g:second' });

      // 'g:first' holds the name tentatively, with a shelf.
      const early = await store.allocateJobId();
      await store.createSubmission(early, 'g:first', 'Sky Dodge');
      await store.setSubmissionSlug(early, 'sky-dodge');
      await store.ensureGameAccess('sky-dodge', 'g:first', at, at);
      await store.rebuildShelf('g:first');
      const before = await store.getShelf('g:first');
      expect(before?.stale).toBeUndefined();

      // An older round settles the name onto 'g:second' instead.
      const settled = await store.recordSettledOwner('sky-dodge', 'g:second', 1, at, at);
      expect(settled?.ownerUid).toBe('g:second');

      // Without this the loser's shelf still serves the slug's rounds.
      expect((await store.getShelf('g:first'))?.stale).toBe(true);
    });

    // Gaining a game moves no ownerUid either, so the count still agrees.
    it('invalidates the recipient shelf when an editor invite is accepted', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:owner' });
      await store.upsertUser({ uid: 'g:editor' });
      await store.ensureGameAccess('sky-dodge', 'g:owner', at, at);
      const jobId = await store.allocateJobId();
      await store.createSubmission(jobId, 'g:owner', 'Sky Dodge');
      await store.setSubmissionSlug(jobId, 'sky-dodge');

      // The editor has a shelf of their own before being invited.
      const ownJob = await store.allocateJobId();
      await store.createSubmission(ownJob, 'g:editor', 'Mine');
      await store.rebuildShelf('g:editor');
      const before = await store.getShelf('g:editor');
      expect(before?.stale).toBeUndefined();

      const invite = await store.createEditorInvitation('sky-dodge', 'g:owner', 'g:editor', at);
      vi.spyOn(store, 'listSubmissionsByOwner').mockRejectedValue(new Error('firestore is having a day'));
      vi.spyOn(store, 'tombstoneShelf').mockRejectedValue(new Error('firestore is still having a day'));

      await store.acceptEditorInvitation('sky-dodge', 'g:editor', at, (invite as { inviteId: string }).inviteId);

      // Otherwise the shared game is missing until repair.
      expect((await store.getShelf('g:editor'))?.stale).toBe(true);
      vi.restoreAllMocks();
    });

    // A transfer moves no ownerUid either, so neither shelf would notice.
    it('invalidates both sides of a transfer, even with the rebuild dead', async () => {
      const { store } = make();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:ada' });
      await store.upsertUser({ uid: 'g:grace' });
      const jobId = await store.allocateJobId();
      await store.createSubmission(jobId, 'g:ada', 'Sky Dodge');
      await store.setSubmissionSlug(jobId, 'sky-dodge');
      await store.ensureGameAccess('sky-dodge', 'g:ada', at, at);
      await store.rebuildShelf('g:ada');
      const sent = await store.getShelf('g:ada');
      expect(sent?.stale).toBeUndefined();

      const later = new Date(Date.now() + 1000).toISOString();
      const code = (await store.ensureRecipientCode('g:grace', later))!;
      const revision = (await store.getGameAccess('sky-dodge'))!.accessRevision;
      await store.createGameTransferInvitation('sky-dodge', 'g:ada', 'g:grace', revision, later, code);
      const invite = (await store.getActiveGameTransfer('sky-dodge', later))!;

      vi.spyOn(store, 'listSubmissionsByOwner').mockRejectedValue(new Error('firestore is having a day'));
      vi.spyOn(store, 'tombstoneShelf').mockRejectedValue(new Error('firestore is still having a day'));

      await store.acceptGameTransferInvitation('sky-dodge', 'g:grace', later, invite.invitationId);

      // The sender must stop serving the game; the recipient must start.
      expect((await store.getShelf('g:ada'))?.stale).toBe(true);
      expect((await store.getShelf('g:grace'))?.stale).toBe(true);
      vi.restoreAllMocks();
    });

    it('does the same when the editor leaves of their own accord', async () => {
      const { store } = make();
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
