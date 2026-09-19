import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { canActOnSlug } from '../../platform/game-access-permissions.js';
import { resolveGameAccess, roundAuthorityCurrent } from '../../platform/game-access-resolve.js';
import { revokedRoundGeneration } from '../../creation/job-state.js';
import { fakeFirestore } from '../fake-firestore.js';

const AT = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-02T00:00:00.000Z';
const A = 'g:ada';
const B = 'g:bea';
const C = 'g:cal';
const SLUG = 'sky';

const IMPLEMENTATIONS: Array<[string, () => Store]> = [
  ['InMemoryStore', () => new InMemoryStore()],
  ['FirestoreStore(fake)', () => new FirestoreStore(fakeFirestore().db)],
];

async function seedUsers(store: Store) {
  await store.upsertUser({ uid: A });
  await store.upsertUser({ uid: B });
  await store.upsertUser({ uid: C });
}

async function ownerRound(store: Store) {
  const jobId = await store.allocateJobId();
  await store.createSubmission(jobId, A, 'Sky');
  await store.setSubmissionSlug(jobId, SLUG);
  await store.ensureGameAccess(SLUG, A, AT, AT);
  await store.ensureRoundGeneration(jobId);
  return jobId;
}

async function acceptEditor(store: Store, uid: string, at: string) {
  const code = (await store.ensureRecipientCode(uid, at))!;
  await store.createEditorInvitation(SLUG, A, uid, at, code);
  const invite = (await store.getEditorInvite(SLUG, uid, at))!;
  await store.acceptEditorInvitation(SLUG, uid, at, invite.inviteId);
}

async function handOver(store: Store, from: string, to: string, at: string) {
  const code = (await store.ensureRecipientCode(to, at))!;
  const revision = (await store.getGameAccess(SLUG))!.accessRevision;
  await store.createGameTransferInvitation(SLUG, from, to, revision, at, code);
  const invite = (await store.getActiveGameTransfer(SLUG, at))!;
  await store.acceptGameTransferInvitation(SLUG, to, at, invite.invitationId);
}

describe('membership vs round-key epoch', () => {
  for (const [implName, makeStore] of IMPLEMENTATIONS) {
    describe(implName, () => {
      it('keeps the owner round current after an editor accept', async () => {
        const store = makeStore();
        await seedUsers(store);
        const jobId = await ownerRound(store);
        const before = (await store.getSubmission(jobId))!;
        expect(roundAuthorityCurrent(before, await resolveGameAccess(store, SLUG))).toBe(true);

        await acceptEditor(store, B, LATER);

        const after = (await store.getSubmission(jobId))!;
        expect(after.roundGeneration).toBe(before.roundGeneration);
        expect(after.accessEpoch).toBe(before.accessEpoch);
        expect(roundAuthorityCurrent(after, await resolveGameAccess(store, SLUG))).toBe(true);
        expect(await canActOnSlug(store, SLUG, A, 'edit')).toBe(true);
      });

      it('revokes only the removed editor, not the owner or remaining editors', async () => {
        const store = makeStore();
        await seedUsers(store);
        const ownerJob = await ownerRound(store);
        await acceptEditor(store, B, LATER);
        await acceptEditor(store, C, LATER);

        const beaJob = await store.allocateJobId();
        await store.createSubmission(beaJob, B, 'Sky edit');
        await store.setSubmissionSlug(beaJob, SLUG);
        await store.ensureRoundGeneration(beaJob);
        const calJob = await store.allocateJobId();
        await store.createSubmission(calJob, C, 'Sky polish');
        await store.setSubmissionSlug(calJob, SLUG);
        await store.ensureRoundGeneration(calJob);

        const ownerGen = (await store.getSubmission(ownerJob))!.roundGeneration;
        const beaGen = (await store.getSubmission(beaJob))!.roundGeneration;
        const calGen = (await store.getSubmission(calJob))!.roundGeneration;

        expect(await store.removeEditor(SLUG, A, B, LATER)).toMatchObject({ editorUids: [C] });

        const owner = (await store.getSubmission(ownerJob))!;
        const bea = (await store.getSubmission(beaJob))!;
        const cal = (await store.getSubmission(calJob))!;
        expect(owner.roundGeneration).toBe(ownerGen);
        expect(cal.roundGeneration).toBe(calGen);
        expect(bea.roundGeneration).toBe(revokedRoundGeneration(beaGen));
        expect(roundAuthorityCurrent(owner, await resolveGameAccess(store, SLUG))).toBe(true);
        expect(roundAuthorityCurrent(cal, await resolveGameAccess(store, SLUG))).toBe(true);
        expect(await canActOnSlug(store, SLUG, A, 'edit')).toBe(true);
        expect(await canActOnSlug(store, SLUG, C, 'edit')).toBe(true);
        expect(await canActOnSlug(store, SLUG, B, 'edit')).toBe(false);
      });

      it('still fences pre-transfer keys after A → B → A', async () => {
        const store = makeStore();
        await seedUsers(store);
        const old = await ownerRound(store);
        const stamped = (await store.getSubmission(old))!;
        expect(stamped.accessEpoch).toBeDefined();
        expect(roundAuthorityCurrent(stamped, await resolveGameAccess(store, SLUG))).toBe(true);

        await handOver(store, A, B, LATER);
        await handOver(store, B, A, LATER);

        const revived = (await store.getSubmission(old))!;
        expect(roundAuthorityCurrent(revived, await resolveGameAccess(store, SLUG))).toBe(false);

        const fresh = await store.allocateJobId();
        await store.createSubmission(fresh, A, 'Sky again');
        await store.setSubmissionSlug(fresh, SLUG);
        await store.ensureRoundGeneration(fresh);
        expect(roundAuthorityCurrent((await store.getSubmission(fresh))!, await resolveGameAccess(store, SLUG))).toBe(
          true,
        );
      });
    });
  }
});
