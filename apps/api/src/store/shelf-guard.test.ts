import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import { documentAnswersAlone } from '../creation/shelf-source.js';

// Each case runs a store method; claimSeal invalidates nothing itself.

// The rival-claimant case #1416 later covered in the slice; kept as a backstop.
const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

async function shelfIsServable(store: Store, ownerUid: string): Promise<boolean> {
  return documentAnswersAlone(await store.getShelf(ownerUid));
}

// The derived-only shape: a slug with no gameAccess row.
async function dropAccess(store: Store, slug: string): Promise<void> {
  const memory = store as unknown as { gameAccessStore?: { access?: Map<string, unknown> } };
  if (memory.gameAccessStore?.access instanceof Map) {
    memory.gameAccessStore.access.delete(slug);
    return;
  }
  const firestore = store as unknown as {
    db: { collection: (name: string) => { doc: (id: string) => { delete: () => Promise<unknown> } } };
  };
  await firestore.db.collection('gameAccess').doc(slug).delete();
}

// claimSeal only fires on a round already offered for review.
async function readyForReview(store: Store, jobId: number, ownerUid: string, slug: string): Promise<void> {
  await store.createSubmission(jobId, ownerUid, 'Sealed');
  await store.setSubmissionSlug(jobId, slug);
  await store.setSubmissionPreviewVersion(jobId, 'v1');
  const at = new Date().toISOString();
  await store.recordJobTransition(jobId, { to: 'ready_for_review', at, by: 'agent', reason: 'delivered' });
}

// A shared game, whose row the co-editor sees too.
async function shareWithEditor(store: Store, slug: string, ownerUid: string, editorUid: string): Promise<void> {
  await store.upsertUser({ uid: ownerUid });
  await store.upsertUser({ uid: editorUid });
  const at = new Date().toISOString();
  await store.ensureGameAccess(slug, ownerUid, at, at);
  const code = (await store.ensureRecipientCode(editorUid, at))!;
  await store.createEditorInvitation(slug, ownerUid, editorUid, at, code);
  const invite = (await store.getEditorInvite(slug, editorUid, at))!;
  await store.acceptEditorInvitation(slug, editorUid, at, invite.inviteId);
}

// A built shelf is the precondition; without it nothing is being invalidated.
async function withBuiltShelf(store: Store, ownerUid: string): Promise<void> {
  await store.rebuildShelf(ownerUid);
  expect(await shelfIsServable(store, ownerUid)).toBe(true);
}

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`shelf guard: ${implName}`, () => {
    it('invalidates the owner when claimSeal moves the round state', async () => {
      const store = makeStore();
      await readyForReview(store, 1, 'g:owner', 'sealed-game');
      await withBuiltShelf(store, 'g:owner');

      // Writes `state`, which the shelf mirrors; nothing on this path invalidates.
      expect(await store.claimSeal(1, new Date().toISOString())).not.toBeNull();

      expect(await shelfIsServable(store, 'g:owner')).toBe(false);
    });

    it('leaves the shelf servable when the write touches no mirrored field', async () => {
      const store = makeStore();
      await store.createSubmission(2, 'g:owner', 'Quiet');
      await withBuiltShelf(store, 'g:owner');

      // A counter is invisible to a shelf reader; tombstoning it wastes.
      await store.setSubmissionClarificationCount(2, 3);

      expect(await shelfIsServable(store, 'g:owner')).toBe(true);
    });

    it('invalidates a rival claimant when access is created for another owner', async () => {
      const store = makeStore();
      await store.createSubmission(3, 'g:rival', 'Rival');
      await store.setSubmissionSlug(3, 'shared-name');
      await dropAccess(store, 'shared-name');
      await withBuiltShelf(store, 'g:rival');

      // Canonical access for another owner drops the rival's row.
      const at = new Date().toISOString();
      await store.ensureGameAccess('shared-name', 'g:owner', at, at);

      expect(await shelfIsServable(store, 'g:rival')).toBe(false);
    });

    it('invalidates a co-editor when a round lands on a shared game', async () => {
      const store = makeStore();
      await readyForReview(store, 6, 'g:owner', 'shared-seal');
      await shareWithEditor(store, 'shared-seal', 'g:owner', 'g:editor');
      await withBuiltShelf(store, 'g:editor');

      // The co-editor's own count never moves; only this catches it.
      expect(await store.claimSeal(6, new Date().toISOString())).not.toBeNull();

      expect(await shelfIsServable(store, 'g:editor')).toBe(false);
    });
  });
}
