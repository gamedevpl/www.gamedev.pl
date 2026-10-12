import { describe, expect, it } from 'vitest';
import { InMemoryStore } from './store.js';
import { dropCreatorReferenceImages } from './creator-media-store.js';

describe('dropCreatorReferenceImages', () => {
  it('deletes only the named shots and tolerates a missing store or failure', async () => {
    const store = new InMemoryStore();
    await store.createSubmission(3, 'g:owner', 'Fog');
    const refused = await store.appendBuildShot(3, { data: 'cmVm', label: 'creator-reference' });
    const kept = await store.appendBuildShot(3, { data: 'a2VwdA==', label: 'creator-reference' });
    await dropCreatorReferenceImages(store, 3, [refused.id]);
    expect((await store.listBuildShots(3, { label: 'creator-reference' })).map((shot) => shot.id)).toEqual([kept.id]);
    await dropCreatorReferenceImages(undefined, 3, [kept.id]);
    const failing = { deleteBuildShots: async () => Promise.reject(new Error('down')) } as never;
    await expect(dropCreatorReferenceImages(failing, 3, [kept.id])).resolves.toBeUndefined();
  });
});
