import { describe, expect, it } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from '../../platform/store.js';
import { resolveGameAccess, roundAuthorityCurrent } from '../../platform/game-access-resolve.js';
import { fakeFirestore } from '../fake-firestore.js';

const implementations: Array<[string, () => Store]> = [
  ['memory', () => new InMemoryStore()],
  ['firestore', () => new FirestoreStore(fakeFirestore().db)],
];
for (const [name, make] of implementations)
  describe(name, () => {
    it.each([true, false])('fences every removed editor round beyond the write cap (stamped=%s)', async (stamped) => {
      const store = make();
      const at = new Date().toISOString();
      await store.upsertUser({ uid: 'g:owner' });
      await store.upsertUser({ uid: 'g:editor' });
      await store.ensureGameAccess('many-rounds', 'g:owner', at, at);
      const invite = await store.createEditorInvitation('many-rounds', 'g:owner', 'g:editor', at);
      expect(invite).toMatchObject({ status: 'pending' });
      await store.acceptEditorInvitation('many-rounds', 'g:editor', at, (invite as { inviteId: string }).inviteId);
      const jobs: number[] = [];
      for (let n = 0; n < 201; n++) {
        const id = await store.allocateJobId();
        await store.createSubmission(id, 'g:editor', 'Round');
        await store.setSubmissionSlug(id, 'many-rounds');
        if (stamped) await store.ensureRoundGeneration(id);
        jobs.push(id);
      }
      const before = (await store.getSubmission(jobs[0]!))!;
      expect(roundAuthorityCurrent(before, await resolveGameAccess(store, 'many-rounds'))).toBe(true);
      const removedAt = new Date(Date.parse((await store.getSubmission(jobs.at(-1)!))!.createdAt) + 1000).toISOString();
      expect(await store.removeEditor('many-rounds', 'g:owner', 'g:editor', removedAt)).toMatchObject({
        editorUids: [],
      });
      const after = (await store.getSubmission(jobs[0]!))!;
      expect(after.roundGeneration).toBe(before.roundGeneration);
      expect(roundAuthorityCurrent(after, await resolveGameAccess(store, 'many-rounds'))).toBe(false);
      const access = await resolveGameAccess(store, 'many-rounds');
      expect(
        roundAuthorityCurrent(after, access, {
          actorUid: 'g:owner',
          actorRevision: access.accessRevision,
        }),
      ).toBe(true);
      expect(
        roundAuthorityCurrent(after, access, {
          actorUid: 'g:editor',
          actorRevision: before.accessEpoch,
        }),
      ).toBe(false);
      const again = await store.createEditorInvitation('many-rounds', 'g:owner', 'g:editor', removedAt);
      await store.acceptEditorInvitation(
        'many-rounds',
        'g:editor',
        removedAt,
        (again as { inviteId: string }).inviteId,
      );
      await store.ensureRoundGeneration(jobs[0]!);
      expect(
        roundAuthorityCurrent((await store.getSubmission(jobs[0]!))!, await resolveGameAccess(store, 'many-rounds')),
      ).toBe(false);
    });
  });
