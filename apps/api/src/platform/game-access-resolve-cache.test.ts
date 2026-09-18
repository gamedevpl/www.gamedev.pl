import { describe, expect, it, vi } from 'vitest';
import { FirestoreStore, InMemoryStore, type Store } from './store.js';
import { fakeFirestore } from '../store/fake-firestore.js';
import { canActOnSlug } from './game-access-permissions.js';
import { DERIVED_ACCESS_WINDOW_MS } from './derived-access-cache.js';
import { resolveGameAccess } from './game-access-resolve.js';

interface Harness {
  store: Store;
  dropAccess: (slug: string) => Promise<void>;
}

const IMPLEMENTATIONS: Array<[string, () => Harness]> = [
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
      const { db } = fakeFirestore();
      return {
        store: new FirestoreStore(db),
        dropAccess: async (slug) => {
          await db.collection('gameAccess').doc(slug).delete();
        },
      };
    },
  ],
];

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2));

async function submit(store: Store, jobId: number, ownerUid: string, slug: string): Promise<void> {
  await store.createSubmission(jobId, ownerUid, `Game ${jobId}`);
  await store.setSubmissionSlug(jobId, slug);
}

async function seedDerived(harness: Harness): Promise<void> {
  const { store, dropAccess } = harness;
  await submit(store, 1, 'g:ada', 'legacy-shared');
  await tick();
  await submit(store, 2, 'g:grace', 'legacy-shared');
  await tick();
  await submit(store, 3, 'g:hopper', 'other-game');
  await dropAccess('legacy-shared');
}

for (const [implName, makeHarness] of IMPLEMENTATIONS) {
  describe(`derived access cache (${implName})`, () => {
    it('lists a slug once inside the window, not once per resolve', async () => {
      const harness = makeHarness();
      await seedDerived(harness);
      const spy = vi.spyOn(harness.store, 'listSubmissionsBySlug');
      const clock = () => 1_700_000_000_000;

      const first = await resolveGameAccess(harness.store, 'legacy-shared', clock);
      const second = await resolveGameAccess(harness.store, 'legacy-shared', clock);

      expect(first).toEqual(second);
      expect(first.owner).toEqual({ kind: 'creator', uid: 'g:grace' });
      expect(first.source).toBe('derived');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('legacy-shared');
    });

    it('does not treat another slug newest live as this slug owner', async () => {
      const harness = makeHarness();
      await seedDerived(harness);
      const access = await resolveGameAccess(harness.store, 'legacy-shared', () => 1_000);

      expect(access.owner).toEqual({ kind: 'creator', uid: 'g:grace' });
      expect(access.owner).not.toEqual({ kind: 'creator', uid: 'g:hopper' });
      expect(await canActOnSlug(harness.store, 'legacy-shared', 'g:grace', 'read')).toBe(true);
      expect(await canActOnSlug(harness.store, 'legacy-shared', 'g:ada', 'read')).toBe(false);
      expect(await canActOnSlug(harness.store, 'legacy-shared', 'g:hopper', 'read')).toBe(false);
    });

    it('lists again after an invalidating write, even inside the window', async () => {
      const harness = makeHarness();
      await submit(harness.store, 1, 'g:ada', 'legacy-solo');
      await harness.dropAccess('legacy-solo');
      const clock = () => 1_700_000_000_000;
      const spy = vi.spyOn(harness.store, 'listSubmissionsBySlug');

      const before = await resolveGameAccess(harness.store, 'legacy-solo', clock);
      await resolveGameAccess(harness.store, 'legacy-solo', clock);
      expect(before.owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect(spy).toHaveBeenCalledTimes(1);

      await harness.store.upsertUser({ uid: 'g:ada', name: 'Ada' });
      await harness.store.deleteAccountIdentity('g:ada', new Date().toISOString());
      const after = await resolveGameAccess(harness.store, 'legacy-solo', clock);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(after.owner).toEqual({ kind: 'platform', reason: 'no_owner' });
      expect(await canActOnSlug(harness.store, 'legacy-solo', 'g:ada', 'read')).toBe(false);
    });

    it('lists again once the window has passed', async () => {
      const harness = makeHarness();
      await seedDerived(harness);
      const spy = vi.spyOn(harness.store, 'listSubmissionsBySlug');
      let clock = 1_700_000_000_000;

      await resolveGameAccess(harness.store, 'legacy-shared', () => clock);
      clock += DERIVED_ACCESS_WINDOW_MS;
      await resolveGameAccess(harness.store, 'legacy-shared', () => clock);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('does not cache the canonical branch', async () => {
      const harness = makeHarness();
      await submit(harness.store, 1, 'g:ada', 'orbital-dogfight');
      const listSpy = vi.spyOn(harness.store, 'listSubmissionsBySlug');
      const getSpy = vi.spyOn(harness.store, 'getGameAccess');
      const clock = () => 1_000;

      const first = await resolveGameAccess(harness.store, 'orbital-dogfight', clock);
      const second = await resolveGameAccess(harness.store, 'orbital-dogfight', clock);

      expect(first.source).toBe('canonical');
      expect(second.source).toBe('canonical');
      expect(listSpy).not.toHaveBeenCalled();
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('stops using the derived window once a canonical record exists', async () => {
      const harness = makeHarness();
      await seedDerived(harness);
      const clock = () => 1_700_000_000_000;
      await resolveGameAccess(harness.store, 'legacy-shared', clock);
      const spy = vi.spyOn(harness.store, 'listSubmissionsBySlug');

      await harness.store.ensureGameAccess(
        'legacy-shared',
        'g:ada',
        new Date().toISOString(),
        new Date().toISOString(),
      );
      const after = await resolveGameAccess(harness.store, 'legacy-shared', clock);

      expect(after.source).toBe('canonical');
      expect(after.owner).toEqual({ kind: 'creator', uid: 'g:ada' });
      expect(spy).not.toHaveBeenCalled();
    });
  });
}
