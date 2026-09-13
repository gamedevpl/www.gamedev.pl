import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, DELETED_ACCOUNT_UID, type Store } from './store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { classifyOwnerUid, gameAccessMatchesDerived, ownsGame, resolveGameAccess } from './game-access-resolve.js';
import { creatorOwnsSlug, settleSlugClaim } from './slug-ownership.js';
import { resolveOwnerOfRecord } from '../community/owner-of-record.js';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

// createdAt is millisecond precision; a round-order test must advance the clock.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2));

async function submit(store: Store, jobId: number, ownerUid: string, slug: string): Promise<void> {
  await store.createSubmission(jobId, ownerUid, `Game ${jobId}`);
  await store.setSubmissionSlug(jobId, slug);
}

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`game access (${implName})`, () => {
    it('gives a new game a canonical record naming the job owner', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');

      const record = await store.getGameAccess('orbital-dogfight');
      expect(record).toMatchObject({
        slug: 'orbital-dogfight',
        ownerUid: 'g:ada',
        editorUids: [],
        memberUids: ['g:ada'],
        accessRevision: 1,
      });
    });

    it('resolves the same owner as both legacy oracles', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');

      const access = await resolveGameAccess(store, 'orbital-dogfight');
      expect(access.owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect(access.source).toBe('canonical');
      expect(ownsGame(access, 'g:ada')).toBe(true);
      expect(ownsGame(access, 'g:grace')).toBe(false);

      expect(await creatorOwnsSlug(store, 'orbital-dogfight', 'g:ada')).toBe(true);
      expect(await resolveOwnerOfRecord(store, 'orbital-dogfight')).toEqual({ kind: 'creator', uid: 'g:ada' });
    });

    it('falls back to the derived rule for a game with no record', async () => {
      const store = makeStore();
      const access = await resolveGameAccess(store, 'repo-lane-classic');

      expect(access).toEqual({
        owner: { kind: 'platform', reason: 'no_owner' },
        editorUids: [],
        accessRevision: 0,
        source: 'derived',
      });
    });

    it('keeps the first owner when a later round is opened by someone else', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');
      await tick();
      await submit(store, 2, 'g:grace', 'orbital-dogfight');

      // Legacy follows the newest round; canonical does not.
      expect(await creatorOwnsSlug(store, 'orbital-dogfight', 'g:grace')).toBe(true);
      const access = await resolveGameAccess(store, 'orbital-dogfight');
      expect(access.owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect(await gameAccessMatchesDerived(store, 'orbital-dogfight')).toBe(false);
    });

    it('is idempotent: re-settling a slug never rewrites authority', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');
      const first = await store.getGameAccess('orbital-dogfight');

      await store.setSubmissionSlug(1, 'orbital-dogfight');
      await store.ensureGameAccess('orbital-dogfight', 'g:grace', new Date().toISOString());

      expect(await store.getGameAccess('orbital-dogfight')).toEqual(first);
    });

    it('lists a member their games and nobody else theirs', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');
      await submit(store, 2, 'g:grace', 'tide-pool');

      expect((await store.listGameAccessByMember('g:ada')).map((r) => r.slug)).toEqual(['orbital-dogfight']);
      expect((await store.listGameAccessByMember('g:grace')).map((r) => r.slug)).toEqual(['tide-pool']);
      expect(await store.listGameAccessByMember('g:hopper')).toEqual([]);
    });

    it('classifies platform-held games rather than naming a human owner', async () => {
      const store = makeStore();
      await submit(store, 1, 'bot:e2e', 'bot-built');
      await submit(store, 2, DELETED_ACCOUNT_UID, 'orphaned');

      expect((await resolveGameAccess(store, 'bot-built')).owner).toEqual({
        kind: 'platform',
        reason: 'bot_owned',
      });
      expect((await resolveGameAccess(store, 'orphaned')).owner).toEqual({
        kind: 'platform',
        reason: 'owner_deleted',
      });
      expect(await gameAccessMatchesDerived(store, 'bot-built')).toBe(true);
      expect(await gameAccessMatchesDerived(store, 'orphaned')).toBe(true);
    });
  });
}

describe('owner classification', () => {
  it('reads a uid the same way wherever it came from', () => {
    expect(classifyOwnerUid('g:ada')).toEqual({ kind: 'creator', uid: 'g:ada' });
    expect(classifyOwnerUid('bot:e2e')).toEqual({ kind: 'platform', reason: 'bot_owned' });
    expect(classifyOwnerUid(DELETED_ACCOUNT_UID)).toEqual({ kind: 'platform', reason: 'owner_deleted' });
  });
});

for (const [implName, makeStore] of IMPLEMENTATIONS) {
  describe(`game access, contested and erased (${implName})`, () => {
    it('records the job that actually holds the slug, not the one that lost it', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'same-title');
      await tick();
      await submit(store, 2, 'g:grace', 'same-title');

      // Settlement as slug-resolver runs it: Ada takes the alternative.
      await settleSlugClaim(store, 2, 'same-title', 'Same title', async () => true);
      await store.setSubmissionSlug(1, 'same-title-2');
      await settleSlugClaim(store, 1, 'same-title-2', 'Same title', async () => true);

      expect(await store.getGameAccess('same-title')).toMatchObject({ ownerUid: 'g:grace' });
      expect(await store.getGameAccess('same-title-2')).toMatchObject({ ownerUid: 'g:ada' });
    });

    it('hands an erased owners games to the platform', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');

      await store.deleteAccountIdentity('g:ada', new Date().toISOString());

      const record = await store.getGameAccess('orbital-dogfight');
      expect(record).toMatchObject({ ownerUid: DELETED_ACCOUNT_UID, memberUids: [DELETED_ACCOUNT_UID] });
      expect(record!.accessRevision).toBe(2);
      expect((await resolveGameAccess(store, 'orbital-dogfight')).owner).toEqual({
        kind: 'platform',
        reason: 'owner_deleted',
      });
      expect(await store.listGameAccessByMember('g:ada')).toEqual([]);
    });

    it('leaves another creators game untouched by an erasure', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');
      await submit(store, 2, 'g:grace', 'tide-pool');

      await store.deleteAccountIdentity('g:ada', new Date().toISOString());

      expect(await store.getGameAccess('tide-pool')).toMatchObject({ ownerUid: 'g:grace', accessRevision: 1 });
    });

    it('does not let a paused loser overwrite the job that won the name', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'same-title');

      // Ada reads herself as holder, then stalls before publishing authority.
      const adaHolder = await store.getSubmissionBySlug('same-title');
      expect(adaHolder?.jobId).toBe(1);

      await tick();
      await submit(store, 2, 'g:grace', 'same-title');
      await settleSlugClaim(store, 2, 'same-title', 'Same title', async () => true);

      // Ada resumes and writes late.
      const inForce = await store.recordSettledOwner('same-title', 'g:ada', 1, new Date().toISOString());

      expect(inForce).toMatchObject({ ownerUid: 'g:grace', settledJobId: 2 });
      expect(await store.getGameAccess('same-title')).toMatchObject({ ownerUid: 'g:grace' });
    });

    it('tells the late loser it did not settle', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'contested');
      await tick();
      await submit(store, 2, 'g:grace', 'contested');
      await settleSlugClaim(store, 2, 'contested', 'Contested', async () => true);

      // Ada's settlement fails rather than claiming the name.
      const settled = await settleSlugClaim(store, 1, 'contested', 'Contested', async () => true);

      expect(settled).not.toBe('contested');
      expect(await store.getGameAccess('contested')).toMatchObject({ ownerUid: 'g:grace' });
    });

    it('leaves a record settlement did not write alone', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'orbital-dogfight');
      await store.deleteAccountIdentity('g:ada', new Date().toISOString());

      await store.recordSettledOwner('orbital-dogfight', 'g:grace', new Date().toISOString());

      expect(await store.getGameAccess('orbital-dogfight')).toMatchObject({
        ownerUid: DELETED_ACCOUNT_UID,
        accessRevision: 2,
      });
    });

    it('lists every named game a job claimed, drafts included', async () => {
      const store = makeStore();
      await submit(store, 1, 'g:ada', 'unpublished-draft');

      expect(await store.listSubmissionSlugs()).toEqual(['unpublished-draft']);
    });
  });
}
