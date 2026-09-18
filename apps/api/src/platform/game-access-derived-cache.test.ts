import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from './store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { resolveGameAccess } from './game-access-resolve.js';
import { DERIVED_ACCESS_WINDOW_MS } from './game-access-derived-cache.js';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2));

type Harness = {
  store: Store;
  dropAccess: (slug: string) => Promise<void>;
};

const HARNESSES: Array<[string, () => Harness]> = [
  [
    'InMemoryStore',
    () => {
      const store = new InMemoryStore();
      return {
        store,
        dropAccess: async (slug) => {
          (store as unknown as { gameAccessStore: { access: Map<string, unknown> } }).gameAccessStore.access.delete(
            slug,
          );
        },
      };
    },
  ],
  [
    'FirestoreStore(fake)',
    () => {
      const fake = fakeFirestore();
      const store = new FirestoreStore(fake.db);
      return {
        store,
        dropAccess: async (slug) => {
          await fake.db.collection('gameAccess').doc(slug).delete();
        },
      };
    },
  ],
];

async function plantRound(store: Store, jobId: number, ownerUid: string, slug: string): Promise<void> {
  await store.createSubmission(jobId, ownerUid, `Game ${jobId}`);
  await store.setSubmissionSlug(jobId, slug);
}

for (const [implName, makeHarness] of HARNESSES) {
  describe(`derived game-access cache (${implName})`, () => {
    it('lists once inside the window and again after an invalidating write', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await dropAccess('legacy-game');
      await tick();
      await plantRound(store, 2, 'g:grace', 'other-game');
      await dropAccess('other-game');
      expect(await store.getGameAccess('legacy-game')).toBeNull();

      const spy = vi.spyOn(store, 'listSubmissionsBySlug');
      const first = await resolveGameAccess(store, 'legacy-game');
      expect(first).toMatchObject({ source: 'derived', owner: { kind: 'creator', uid: 'g:ada' } });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('legacy-game');

      const second = await resolveGameAccess(store, 'legacy-game');
      expect(second).toEqual(first);
      expect(spy).toHaveBeenCalledTimes(1);

      await store.eraseMemberFromAllGameAccess('g:grace', new Date().toISOString());
      const third = await resolveGameAccess(store, 'legacy-game');
      expect(third).toMatchObject({ source: 'derived', owner: { kind: 'creator', uid: 'g:ada' } });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('shares one list among concurrent misses', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await dropAccess('legacy-game');
      await tick();
      await plantRound(store, 2, 'g:grace', 'other-game');
      await dropAccess('other-game');

      const original = store.listSubmissionsBySlug.bind(store);
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi.spyOn(store, 'listSubmissionsBySlug').mockImplementation(async (slug) => {
        await gate;
        return original(slug);
      });

      const first = resolveGameAccess(store, 'legacy-game');
      const second = resolveGameAccess(store, 'legacy-game');
      release?.();
      expect((await first).owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect(await second).toEqual(await first);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('lists again once the window has passed', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await dropAccess('legacy-game');
      await tick();
      await plantRound(store, 2, 'g:grace', 'other-game');
      await dropAccess('other-game');

      const spy = vi.spyOn(store, 'listSubmissionsBySlug');
      let now = 1_000;
      await resolveGameAccess(store, 'legacy-game', () => now);
      await resolveGameAccess(store, 'legacy-game', () => now + DERIVED_ACCESS_WINDOW_MS - 1);
      expect(spy).toHaveBeenCalledTimes(1);
      now += DERIVED_ACCESS_WINDOW_MS;
      await resolveGameAccess(store, 'legacy-game', () => now);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('does not cache a canonical answer on the derived path', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await tick();
      await plantRound(store, 2, 'g:grace', 'legacy-game');
      await tick();
      await plantRound(store, 3, 'g:hopper', 'other-game');

      const spy = vi.spyOn(store, 'listSubmissionsBySlug');
      const canonical = await resolveGameAccess(store, 'legacy-game');
      expect(canonical).toMatchObject({ source: 'canonical', owner: { kind: 'creator', uid: 'g:ada' } });
      expect(spy).not.toHaveBeenCalled();

      await dropAccess('legacy-game');
      const derived = await resolveGameAccess(store, 'legacy-game');
      expect(derived).toMatchObject({ source: 'derived', owner: { kind: 'creator', uid: 'g:grace' } });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('legacy-game');
    });

    it('does not leave a failed list as the answer for the next request', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await dropAccess('legacy-game');

      const original = store.listSubmissionsBySlug.bind(store);
      const spy = vi
        .spyOn(store, 'listSubmissionsBySlug')
        .mockRejectedValueOnce(new Error('firestore down'))
        .mockImplementation(original);

      await expect(resolveGameAccess(store, 'legacy-game')).rejects.toThrow('firestore down');
      await expect(resolveGameAccess(store, 'legacy-game')).resolves.toMatchObject({
        owner: { kind: 'creator', uid: 'g:ada' },
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('keeps one store’s window out of another store’s', async () => {
      const first = makeHarness();
      const second = makeHarness();
      await plantRound(first.store, 1, 'g:ada', 'legacy-game');
      await first.dropAccess('legacy-game');
      await plantRound(second.store, 1, 'g:grace', 'legacy-game');
      await second.dropAccess('legacy-game');

      expect((await resolveGameAccess(first.store, 'legacy-game')).owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect((await resolveGameAccess(second.store, 'legacy-game')).owner).toEqual({
        kind: 'creator',
        uid: 'g:grace',
      });
    });

    it('takes the canonical path after ensureGameAccess without serving stale derived', async () => {
      const { store, dropAccess } = makeHarness();
      await plantRound(store, 1, 'g:ada', 'legacy-game');
      await tick();
      await plantRound(store, 2, 'g:grace', 'legacy-game');
      await dropAccess('legacy-game');
      await tick();
      await plantRound(store, 3, 'g:hopper', 'other-game');
      await dropAccess('other-game');
      expect(await store.getGameAccess('legacy-game')).toBeNull();

      const spy = vi.spyOn(store, 'listSubmissionsBySlug');
      expect(await resolveGameAccess(store, 'legacy-game')).toMatchObject({
        source: 'derived',
        owner: { kind: 'creator', uid: 'g:grace' },
      });
      expect(spy).toHaveBeenCalledTimes(1);

      const at = new Date().toISOString();
      await store.ensureGameAccess('legacy-game', 'g:ada', at, at);
      const after = await resolveGameAccess(store, 'legacy-game');
      expect(after).toMatchObject({ source: 'canonical', owner: { kind: 'creator', uid: 'g:ada' } });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
}
