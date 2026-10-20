import { describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../store/fake-firestore.js';
import { createCreatorMemoryEraser } from '../agent-surface/creator-memory-eraser.js';
import { eraseAccount } from './erase-account.js';
import { FirestoreStore, InMemoryStore, type Store } from './store.js';

async function creatorWithMemory(store: Store): Promise<string> {
  const uid = 'g:leaver';
  await store.upsertUser({ uid });
  await store.claimCreatorMemory({ ownerUid: uid, vendor: 'anthropic', storeId: 'mem_1', createdAt: 't' });
  await store.claimCreatorMemory({ ownerUid: 'g:stays', vendor: 'anthropic', storeId: 'mem_2', createdAt: 't' });
  return uid;
}

describe('creator memory on account erasure', () => {
  it.each([
    ['in memory', () => new InMemoryStore()],
    ['firestore', () => new FirestoreStore(fakeFirestore().db)],
  ])('deletes the vendor store, then the index record (%s)', async (_name, make) => {
    const store = make();
    const uid = await creatorWithMemory(store);
    const eraseMemoryStore = vi.fn(async () => undefined);

    // A round the leaver started as an editor elsewhere.
    await store.createSubmission(7, 'g:stays', 'Shared');
    await store.recordDispatch(7, { backend: 'managed:anthropic', ref: 's1', memoryOwnerUid: uid });
    await store.requestBuilderHandoff(7, 'self', 't', true, uid);

    const result = await eraseAccount({ store, uid, eraseMemoryStore });
    expect((await store.getSubmission(7))?.builderHandoff).toMatchObject({ to: 'self' });
    expect((await store.getSubmission(7))?.builderHandoff?.requestedByUid).toBeUndefined();

    expect(result.creatorMemoryStores).toBe(1);
    expect((await store.getSubmission(7))?.dispatch).toMatchObject({ refs: ['s1'] });
    expect((await store.getSubmission(7))?.dispatch?.memoryOwnerUid).toBeUndefined();
    expect(eraseMemoryStore).toHaveBeenCalledWith('anthropic', 'mem_1');
    expect(await store.listCreatorMemory(uid)).toEqual([]);
    expect(await store.getCreatorMemory('g:stays', 'anthropic')).toMatchObject({ storeId: 'mem_2' });
  });

  it.each([
    ['in memory', () => new InMemoryStore()],
    ['firestore', () => new FirestoreStore(fakeFirestore().db)],
  ])('drops a fenced uid from a dispatch that lands after the scrub (%s)', async (_name, make) => {
    const store = make();
    await store.createSubmission(8, 'g:stays', 'Late');
    await store.beginAccountErasure('g:leaver', 't');
    await store.recordDispatch(8, { backend: 'managed:anthropic', ref: 's2', memoryOwnerUid: 'g:leaver' });
    const dispatch = (await store.getSubmission(8))?.dispatch;
    expect(dispatch?.refs).toEqual(['s2']);
    expect(dispatch?.memoryOwnerUid).toBeUndefined();
  });

  it.each([
    ['in memory', () => new InMemoryStore()],
    ['firestore', () => new FirestoreStore(fakeFirestore().db)],
  ])('keeps the memory owner of a same-uid signup after erasure (%s)', async (_name, make) => {
    const store = make();
    await store.createSubmission(9, 'g:stays', 'Back');
    await store.beginAccountErasure('g:returner', '2000-01-01T00:00:00.000Z');
    await store.upsertUser({ uid: 'g:returner' });
    await store.recordDispatch(9, { backend: 'managed:anthropic', ref: 's3', memoryOwnerUid: 'g:returner' });
    expect((await store.getSubmission(9))?.dispatch?.memoryOwnerUid).toBe('g:returner');
  });

  it('fails the erasure and keeps the record when the vendor refuses', async () => {
    const store = new InMemoryStore();
    const uid = await creatorWithMemory(store);
    const eraseMemoryStore = vi.fn(async () => Promise.reject(new Error('503')));

    await expect(eraseAccount({ store, uid, eraseMemoryStore })).rejects.toThrow('503');
    expect(await store.getCreatorMemory(uid, 'anthropic')).toMatchObject({ storeId: 'mem_1' });
    // The identity survives, so the sweep finds the account due again.
    expect(await store.getUser(uid)).not.toBeNull();
  });

  it('refuses to erase silently when no eraser is configured', async () => {
    const store = new InMemoryStore();
    const uid = await creatorWithMemory(store);
    await expect(eraseAccount({ store, uid })).rejects.toThrow(/no eraser/);
    expect(await eraseAccount({ store, uid, dryRun: true })).toMatchObject({ creatorMemoryStores: 1 });
  });

  it('treats an already deleted vendor store as erased', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 404 }));
    const erase = createCreatorMemoryEraser({ apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    await erase('anthropic', 'mem_1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/memory_stores/mem_1');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>)['anthropic-beta']).toBe('agent-memory-2026-07-22');

    const failing = createCreatorMemoryEraser({
      apiKey: 'k',
      fetchImpl: (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch,
    });
    await expect(failing('anthropic', 'mem_1')).rejects.toThrow('500');
    await expect(erase('gemini', 'x')).rejects.toThrow(/no memory store eraser/);
  });
});
