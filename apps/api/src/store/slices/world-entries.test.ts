import { describe, expect, it } from 'vitest';
import { fakeFirestore } from '../fake-firestore.js';
import { FirestoreWorldEntriesStore, InMemoryWorldEntriesStore, type WorldEntriesStore } from './world-entries.js';

// The revision lets a read prove nothing changed, cheaply.

function plot(uid: string, key: string) {
  return { worldId: 'garden', key, uid, fields: { plant: 'oak' }, maxPerPlayer: 5, maxEntries: 100 };
}

const backends: Array<[string, () => WorldEntriesStore]> = [
  ['in memory', () => new InMemoryWorldEntriesStore()],
  ['firestore', () => new FirestoreWorldEntriesStore(fakeFirestore().db)],
];

describe.each(backends)('world revision (%s)', (_name, make) => {
  it('starts at zero for a world nobody has written', async () => {
    expect(await make().getWorldRevision('garden')).toBe(0);
  });

  it('moves on a claim, an edit and a delete', async () => {
    const store = make();

    await store.putWorldEntry(plot('g:alice', 'plot.1'));
    const claimed = await store.getWorldRevision('garden');
    expect(claimed).toBeGreaterThan(0);

    // An edit is as visible as a claim, so it counts too.
    await store.putWorldEntry(plot('g:alice', 'plot.1'));
    const edited = await store.getWorldRevision('garden');
    expect(edited).toBeGreaterThan(claimed);

    await store.deleteWorldEntry('garden', 'plot.1', 'g:alice');
    expect(await store.getWorldRevision('garden')).toBeGreaterThan(edited);
  });

  it('holds still for a write that changed nothing', async () => {
    const store = make();
    await store.putWorldEntry(plot('g:alice', 'plot.1'));
    const before = await store.getWorldRevision('garden');

    // A refusal must not look like a change.
    expect(await store.putWorldEntry(plot('g:bob', 'plot.1'))).toMatchObject({ ok: false });
    expect(await store.deleteWorldEntry('garden', 'plot.1', 'g:bob')).toBe(false);
    expect(await store.deleteWorldEntry('garden', 'missing', 'g:alice')).toBe(false);

    expect(await store.getWorldRevision('garden')).toBe(before);
  });

  it('moves when an erasure takes somebody out of the world', async () => {
    const store = make();
    await store.putWorldEntry(plot('g:alice', 'plot.1'));
    await store.putWorldEntry(plot('g:bob', 'plot.2'));
    const before = await store.getWorldRevision('garden');

    expect(await store.deleteWorldEntriesForUser('g:bob')).toBe(1);

    expect(await store.getWorldRevision('garden')).toBeGreaterThan(before);
  });

  it('keeps the revision of one world out of another', async () => {
    const store = make();
    await store.putWorldEntry({ ...plot('g:alice', 'plot.1'), worldId: 'meadow' });

    expect(await store.getWorldRevision('meadow')).toBeGreaterThan(0);
    expect(await store.getWorldRevision('garden')).toBe(0);
  });
});
