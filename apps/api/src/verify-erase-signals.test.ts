import { describe, expect, it } from 'vitest';
import { InMemoryStore, type Store } from './store.js';
import {
  isVerificationUid,
  mintVerificationUid,
  VERIFICATION_SLUG,
  VERIFICATION_WORLD_ID,
  verifyEraseSignals,
} from './verify-erase-signals.js';

const uid = mintVerificationUid('test');

function stepNamed(steps: Array<{ name: string; ok: boolean }>, name: string): { name: string; ok: boolean } {
  const step = steps.find((candidate) => candidate.name === name);
  if (!step) throw new Error(`no step named "${name}" — steps were: ${steps.map((s) => s.name).join(', ')}`);
  return step;
}

/** A store that behaves normally except for the one method under examination. */
function storeWith(overrides: Partial<Store>): Store {
  const store = new InMemoryStore();
  return new Proxy(store, {
    get(target, property, receiver) {
      const override = overrides[property as keyof Store];
      if (override) return (override as (...args: unknown[]) => unknown).bind(target);
      return Reflect.get(target, property, receiver) as unknown;
    },
  }) as Store;
}

describe('verifyEraseSignals', () => {
  it('passes against a store where erasure works', async () => {
    const result = await verifyEraseSignals({ store: new InMemoryStore(), uid });

    expect(result.ok).toBe(true);
    expect(result.residue).toEqual([]);
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });

  it('leaves no fixture behind when it passes', async () => {
    // The command writes to the same database it is verifying. A run that proves erasure
    // works and then leaves its own rows in production has traded one residue problem for
    // another, and this is the assertion that says which one happened.
    const store = new InMemoryStore();

    await verifyEraseSignals({ store, uid });

    expect(await store.listWorldEntries(VERIFICATION_WORLD_ID)).toEqual([]);
    expect(await store.countPlayerFeedbackByUid(uid)).toBe(0);
    expect(await store.listGameSaves(uid)).toEqual([]);
  });

  it('refuses any uid that could belong to a person, before writing anything', async () => {
    // The safety property this command rests on. Every uid below is one a real account can
    // hold; a verification run against one would plant rows on it and then erase
    // everything it owns.
    const store = new InMemoryStore();
    await store.putGameSave('g:12345', 'some-game', '{}', 1);

    for (const forbidden of ['g:12345', 'bot:e2e', 'dev:local', 'verify:', '']) {
      await expect(verifyEraseSignals({ store, uid: forbidden })).rejects.toThrow(/refusing to run/);
    }

    // Nothing was planted and — the part that matters — nothing belonging to the real
    // account was touched on the way to refusing.
    expect(await store.listGameSaves('g:12345')).toHaveLength(1);
    expect(await store.listWorldEntries(VERIFICATION_WORLD_ID)).toEqual([]);
  });

  it('fails, rather than passing quietly, when the dry run deletes what it previews', async () => {
    // A dry run is the only thing between an operator and an irreversible delete. One that
    // removes rows while reporting them is the worst failure this command can find, so it
    // gets its own detection rather than being inferred from a later step.
    const store = storeWith({
      async countPlayerFeedbackByUid(this: InMemoryStore, id: string) {
        return this.deletePlayerFeedbackByUid(id);
      },
    });

    const result = await verifyEraseSignals({ store, uid });

    expect(result.ok).toBe(false);
    expect(stepNamed(result.steps, 'dry run removed nothing').ok).toBe(false);
  });

  it('fails when a confirmed run reports a deletion it did not make', async () => {
    // The gap between "said it deleted the world entry" and "deleted the world entry" is
    // invisible to anyone reading the command's own output, which is why the check is a
    // read of the database instead.
    const store = storeWith({
      async deleteWorldEntriesForUser() {
        return 1;
      },
    });

    const result = await verifyEraseSignals({ store, uid });

    expect(result.ok).toBe(false);
    expect(stepNamed(result.steps, 'fixtures are gone from the database').ok).toBe(false);
    // And it says so: a world entry it could not delete is residue an operator must clear.
    expect(result.residue.join(' ')).toContain(VERIFICATION_WORLD_ID);
  });

  it('cleans up its fixtures when the erase path throws part-way through', async () => {
    // The realistic failure: a missing or still-building collection-group index takes down
    // the first indexed read. The run is over at that point, but the rows it planted are
    // still in production and are its responsibility.
    let thrown = false;
    const store = storeWith({
      async listWorldsForUser(this: InMemoryStore, id: string) {
        if (!thrown) {
          thrown = true;
          throw new Error('9 FAILED_PRECONDITION: The query requires a COLLECTION_GROUP_ASC index');
        }
        return this.listWorldsForUser(id);
      },
    });

    const result = await verifyEraseSignals({ store, uid });

    expect(result.ok).toBe(false);
    expect(stepNamed(result.steps, 'run completed').ok).toBe(false);
    expect(result.steps.at(-1)?.detail).toContain('FAILED_PRECONDITION');
    expect(result.residue).toEqual([]);
  });

  it('claims no residue when it never got far enough to plant anything', async () => {
    // The shape of a database that is simply unreachable — wrong credentials, wrong
    // project, network down. Every call fails, including the first. An operator staring
    // at that error must not also be sent hunting for fixtures that were never written.
    const store = new Proxy(new InMemoryStore(), {
      get() {
        return () => Promise.reject(new Error('Unable to detect a Project Id in the current environment'));
      },
    }) as Store;

    const result = await verifyEraseSignals({ store, uid });

    expect(result.ok).toBe(false);
    expect(result.residue).toEqual([]);
    expect(result.steps.at(-1)?.detail).toContain('Project Id');
  });

  it('reports residue it could not clear instead of swallowing the error', async () => {
    // Cleanup leans on the same methods the run was testing, so the case where cleanup
    // itself fails is not hypothetical. Somebody has to be told.
    const store = storeWith({
      async deleteGameSaves() {
        throw new Error('permission denied');
      },
    });

    const result = await verifyEraseSignals({ store, uid });

    expect(result.residue.join(' ')).toContain('permission denied');
    expect(result.residue.join(' ')).toContain(VERIFICATION_SLUG);
  });

  it('leaves a populated database exactly as it found it', async () => {
    // What makes this safe to run against production on a whim. The command erases
    // everything its uid owns, so the invariant that matters is not "it cleaned up after
    // itself" but "it was never able to see anybody else's rows in the first place".
    const store = new InMemoryStore();
    const player = 'g:12345';
    await store.castVote('wanderers-green', player, 'up');
    await store.addPlayerFeedback('wanderers-green', player, 'lovely little game');
    await store.putGameSave(player, 'wanderers-green', '{"progress":7}', 3);
    await store.putWorldEntry({
      worldId: 'wanderers-green',
      key: 'plot.1',
      uid: player,
      fields: { col: 1, row: 2 },
      maxPerPlayer: 3,
      maxEntries: 2000,
    });

    const snapshot = async () =>
      JSON.stringify({
        vote: await store.getVote('wanderers-green', player),
        counts: await store.getVoteCounts('wanderers-green'),
        feedback: await store.listPlayerFeedback('wanderers-green'),
        saves: await store.listGameSaves(player),
        world: await store.listWorldEntries('wanderers-green'),
        worlds: await store.listWorldsForUser(player),
      });
    const before = await snapshot();

    const result = await verifyEraseSignals({ store, uid });

    expect(result.ok).toBe(true);
    expect(await snapshot()).toEqual(before);
  });

  it('does not claim to have covered votes', async () => {
    // A green run must not be read as "erasure is proven for all four signals". Votes are
    // out of scope because planting one writes the parent game document; see the module
    // comment. The flag exists so the CLI can say so on every run.
    const store = new InMemoryStore();

    const result = await verifyEraseSignals({ store, uid });

    expect(result.votesCovered).toBe(false);
    expect(await store.getVote(VERIFICATION_SLUG, uid)).toBeNull();
  });
});

describe('isVerificationUid', () => {
  it('accepts only the synthetic namespace', () => {
    expect(isVerificationUid(mintVerificationUid('abc'))).toBe(true);
    expect(isVerificationUid('g:12345')).toBe(false);
    expect(isVerificationUid('bot:e2e')).toBe(false);
    // The bare prefix names nobody and would make a fixture uid nothing can distinguish
    // between runs.
    expect(isVerificationUid('verify:')).toBe(false);
  });

  it('mints uids that differ between runs', () => {
    // Two operators running this at once must not delete each other's fixtures and read
    // the resulting emptiness as a successful erase.
    expect(mintVerificationUid('one')).not.toEqual(mintVerificationUid('two'));
  });
});
