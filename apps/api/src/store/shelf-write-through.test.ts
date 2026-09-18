import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../platform/store.js';
import { fakeFirestore } from './fake-firestore.js';
import { judgeShelfShadow, recordShelfShadow } from '../creation/shelf-shadow.js';
import { reconcileTransferredOwnership } from '../creation/studio-shelf-records.js';

// Both stores: the write-through spans facade and class.
const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

// Same records and count the production shadow judges against.
async function agrees(store: Store, ownerUid: string): Promise<string> {
  const owned = await store.listSubmissionsByOwner(ownerUid);
  const records = await reconcileTransferredOwnership(store, ownerUid, owned);
  const [shelf, count] = await Promise.all([store.getShelf(ownerUid), store.countSubmissionsByOwner(ownerUid)]);
  return judgeShelfShadow(shelf, records, count).verdict;
}

async function acceptTransfer(store: Store, slug: string, senderUid: string, recipientUid: string): Promise<void> {
  const at = new Date().toISOString();
  await store.ensureGameAccess(slug, senderUid, at, at);
  const later = new Date(Date.now() + 1000).toISOString();
  const code = (await store.ensureRecipientCode(recipientUid, later))!;
  const revision = (await store.getGameAccess(slug))!.accessRevision;
  await store.createGameTransferInvitation(slug, senderUid, recipientUid, revision, later, code);
  const invite = (await store.getActiveGameTransfer(slug, later))!;
  await store.acceptGameTransferInvitation(slug, recipientUid, later, invite.invitationId);
}

async function acceptEditor(store: Store, slug: string, ownerUid: string, editorUid: string): Promise<void> {
  const at = new Date().toISOString();
  const code = (await store.ensureRecipientCode(editorUid, at))!;
  await store.createEditorInvitation(slug, ownerUid, editorUid, at, code);
  const invite = (await store.getEditorInvite(slug, editorUid, at))!;
  await store.acceptEditorInvitation(slug, editorUid, at, invite.inviteId);
}

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`shelf write-through: ${implName}`, () => {
    it('has a shelf that agrees the moment the first round is created', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');

      expect(await agrees(store, 'g:owner')).toBe('match');
    });

    it('stays in agreement through every shelf-relevant writer', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      await store.createSubmission(2, 'g:owner', 'Second');

      // Every writer the plan names; the shelf must survive.
      await store.setSubmissionSlug(1, 'sky');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionTitle(1, 'Sky, renamed');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionPreviewVersion(1, 'v1');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionDeliveredVersion(1, 'v2');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionLastStatus(1, 'in_review');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionNotifiedStatus(1, 'in_review');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionPublishedAt(1, '2026-09-13T00:00:00.000Z');
      expect(await agrees(store, 'g:owner')).toBe('match');

      await store.setSubmissionAbandoned(2, '2026-09-13T00:00:00.000Z');
      expect(await agrees(store, 'g:owner')).toBe('match');
    });

    it('mirrors draft sharing, which the Studio shelf renders', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      await store.setSubmissionSlug(1, 'sky');

      await store.setDraftShared(1, '2026-09-13T00:00:00.000Z');
      expect(await agrees(store, 'g:owner')).toBe('match');
      expect((await store.getShelf('g:owner'))?.rounds[0]?.draftSharedAt).toBe('2026-09-13T00:00:00.000Z');

      await store.setDraftShared(1, null);
      expect(await agrees(store, 'g:owner')).toBe('match');
      expect((await store.getShelf('g:owner'))?.rounds[0]?.draftSharedAt).toBeUndefined();
    });

    it('mirrors a slug taken by an atomic claim, not only by the plain setter', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');

      expect(await store.claimSubmissionSlug(1, 'sky', null)).toBe(true);
      expect(await agrees(store, 'g:owner')).toBe('match');
      expect((await store.getShelf('g:owner'))?.rounds[0]?.slug).toBe('sky');
    });

    it('answers false from rebuildShelf only when it could not write', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');

      expect(await store.rebuildShelf('g:owner')).toBe(true);
    });

    it('mirrors what the reader would serve, not just the round count', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      await store.setSubmissionSlug(1, 'sky');
      await store.setSubmissionLastStatus(1, 'published');

      const shelf = await store.getShelf('g:owner');
      expect(shelf?.rounds[0]).toMatchObject({ jobId: 1, slug: 'sky', lastStatus: 'published' });
    });

    it('keeps one owner out of another owner shelf', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'Mine');
      await store.createSubmission(2, 'g:stranger', 'Theirs');

      expect((await store.getShelf('g:owner'))?.rounds.map((round) => round.jobId)).toEqual([1]);
      expect((await store.getShelf('g:stranger'))?.rounds.map((round) => round.jobId)).toEqual([2]);
    });

    it('rebuilds from source, so a shelf written behind its back is corrected', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      // Stands in for a rollback revision writing behind the document.
      await store.putShelf('g:owner', {
        version: 1,
        builtAt: '2026-01-01T00:00:00.000Z',
        sourceCount: 99,
        rounds: [],
      });
      expect(await agrees(store, 'g:owner')).toBe('count');

      await store.rebuildShelf('g:owner');
      expect(await agrees(store, 'g:owner')).toBe('match');
    });

    it('reports a stale shelf as stale rather than as agreement', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      const fresh = await store.getShelf('g:owner');

      // Same count, different content: only a collapse comparison can see this.
      await store.putShelf('g:owner', {
        ...fresh!,
        rounds: [{ ...fresh!.rounds[0]!, title: 'Something else', slug: 'other' }],
      });

      expect(await agrees(store, 'g:owner')).toBe('collapse');
    });

    it('lists a shelf as stale only once it is older than the cutoff', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');

      expect(await store.listStaleShelfOwners('2026-01-01T00:00:00.000Z', 10)).toEqual([]);
      expect(await store.listStaleShelfOwners('2999-01-01T00:00:00.000Z', 10)).toEqual(['g:owner']);
    });

    it('forgets a shelf on request', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'First');
      await store.deleteShelf('g:owner');

      expect(await store.getShelf('g:owner')).toBeNull();
    });

    it('mirrors a transferred round that list-by-owner would miss', async () => {
      const store = makeStore();
      await store.upsertUser({ uid: 'g:ada' });
      await store.upsertUser({ uid: 'g:grace' });

      // Sender: three slugless plus one slugged; the live 4-vs-3 case.
      await store.createSubmission(1, 'g:ada', 'One');
      await store.createSubmission(2, 'g:ada', 'Two');
      await store.createSubmission(3, 'g:ada', 'Three');
      await store.createSubmission(4, 'g:ada', 'Sky');
      await store.setSubmissionSlug(4, 'sky');

      // Recipient already has three; a missed write-through is 4 vs 3.
      await store.createSubmission(5, 'g:grace', 'Grace one');
      await store.createSubmission(6, 'g:grace', 'Grace two');
      await store.createSubmission(7, 'g:grace', 'Grace three');

      await acceptTransfer(store, 'sky', 'g:ada', 'g:grace');

      expect(await agrees(store, 'g:grace')).toBe('match');
      expect(await agrees(store, 'g:ada')).toBe('match');
    });

    it('refreshes the tip when an editor leave cancels the newer round', async () => {
      const store = makeStore();
      await store.upsertUser({ uid: 'g:ada' });
      await store.upsertUser({ uid: 'g:bea' });

      await store.createSubmission(1, 'g:ada', 'Sky');
      await store.setSubmissionSlug(1, 'sky');
      const at = new Date().toISOString();
      await store.ensureGameAccess('sky', 'g:ada', at, at);
      await acceptEditor(store, 'sky', 'g:ada', 'g:bea');

      await store.createSubmission(2, 'g:bea', 'Sky edit');
      await store.setSubmissionSlug(2, 'sky');
      await store.recordJobTransition(2, { to: 'building', at: new Date().toISOString(), by: 'creator' });

      await store.leaveGame('sky', 'g:bea', new Date().toISOString());

      expect(await agrees(store, 'g:ada')).toBe('match');
      expect(await agrees(store, 'g:bea')).toBe('match');
    });

    // The idle-account case: no write to hook, no row to find.
    it('backfills an account whose rounds predate the mirror, on its first read', async () => {
      const store = makeStore();
      await store.createSubmission(1, 'g:owner', 'Pre-existing');
      // Simulates a round from before the mirror shipped.
      await store.deleteShelf('g:owner');
      expect(await store.getShelf('g:owner')).toBeNull();

      const records = await store.listSubmissionsByOwner('g:owner');
      // Awaited: recordShelfShadow must not resolve before the backfill lands.
      await recordShelfShadow({ store, log: { warn: () => {} } }, 'g:owner', records);

      expect(await agrees(store, 'g:owner')).toBe('match');
    });
  });
}
