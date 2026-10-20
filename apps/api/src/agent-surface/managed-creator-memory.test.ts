import { describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { creatorMemoryLabel, resolveCreatorMemory } from './managed-creator-memory.js';

const provider = (ids: string[]) => {
  let next = 0;
  return {
    vendor: 'anthropic',
    createMemoryStore: vi.fn(async (_label: string) => ids[next++]!),
    deleteMemoryStore: vi.fn(async () => undefined),
  };
};

describe('resolveCreatorMemory', () => {
  it('creates one store per creator and reuses it across their games', async () => {
    const index = new InMemoryStore();
    const vendor = provider(['mem_1', 'mem_2']);
    expect(await resolveCreatorMemory(vendor, index, 'g:ada')).toBe('mem_1');
    expect(await resolveCreatorMemory(vendor, index, 'g:ada')).toBe('mem_1');
    expect(await resolveCreatorMemory(vendor, index, 'g:bob')).toBe('mem_2');
    expect(vendor.createMemoryStore).toHaveBeenCalledTimes(2);
  });

  it('names the store by an opaque label, never the uid', async () => {
    const vendor = provider(['mem_1']);
    await resolveCreatorMemory(vendor, new InMemoryStore(), 'g:ada');
    const [label] = vendor.createMemoryStore.mock.calls[0]!;
    expect(label).toBe(creatorMemoryLabel('g:ada'));
    expect(label).toMatch(/^[0-9a-f]{16}$/);
    expect(label).not.toContain('ada');
  });

  it('keeps the first claim and deletes the store that lost the race', async () => {
    const index = new InMemoryStore();
    await index.claimCreatorMemory({ ownerUid: 'g:ada', vendor: 'anthropic', storeId: 'mem_won', createdAt: 't' });
    const racing = {
      getAccountErasure: async () => null,
      getUser: async () => null,
      getCreatorMemory: async () => null,
      claimCreatorMemory: index.claimCreatorMemory.bind(index),
      deleteCreatorMemory: index.deleteCreatorMemory.bind(index),
    };
    const vendor = provider(['mem_lost']);
    expect(await resolveCreatorMemory(vendor, racing, 'g:ada')).toBe('mem_won');
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_lost');
  });

  it('deletes a created store when recording it fails', async () => {
    const vendor = provider(['mem_orphan']);
    const broken = {
      getAccountErasure: async () => null,
      getUser: async () => null,
      deleteCreatorMemory: async () => undefined,
      getCreatorMemory: async () => null,
      claimCreatorMemory: async () => Promise.reject(new Error('firestore down')),
    };
    expect(await resolveCreatorMemory(vendor, broken, 'g:ada')).toBeUndefined();
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_orphan');
  });

  it('starts without memory when unset, ownerless, unsupported or failing', async () => {
    const index = new InMemoryStore();
    expect(await resolveCreatorMemory(provider(['m']), undefined, 'g:ada')).toBeUndefined();
    expect(await resolveCreatorMemory(provider(['m']), index, undefined)).toBeUndefined();
    expect(await resolveCreatorMemory({ vendor: 'gemini' }, index, 'g:ada')).toBeUndefined();
    const failing = { vendor: 'anthropic', createMemoryStore: async () => Promise.reject(new Error('beta off')) };
    const warn = vi.fn();
    expect(await resolveCreatorMemory(failing, index, 'g:ada', { warn })).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('creates nothing for a creator whose erasure has begun', async () => {
    const index = new InMemoryStore();
    await index.beginAccountErasure('g:ada', 't');
    const vendor = provider(['mem_1']);
    expect(await resolveCreatorMemory(vendor, index, 'g:ada')).toBeUndefined();
    expect(vendor.createMemoryStore).not.toHaveBeenCalled();
  });

  it('gives a same-uid signup after erasure its own memory', async () => {
    const index = new InMemoryStore();
    await index.beginAccountErasure('g:ada', '2000-01-01T00:00:00.000Z');
    await index.upsertUser({ uid: 'g:ada' });
    expect(await resolveCreatorMemory(provider(['mem_new']), index, 'g:ada')).toBe('mem_new');
  });

  it('undoes a claim that lands after erasure listed the stores', async () => {
    const index = new InMemoryStore();
    const vendor = provider(['mem_late']);
    let fenced = false;
    const racing = {
      getAccountErasure: async () => (fenced ? 't' : null),
      getUser: async () => null,
      getCreatorMemory: index.getCreatorMemory.bind(index),
      claimCreatorMemory: async (record: Parameters<typeof index.claimCreatorMemory>[0]) => {
        const held = await index.claimCreatorMemory(record);
        // Erasure fences and lists between our first check and the claim.
        fenced = true;
        return held;
      },
      deleteCreatorMemory: index.deleteCreatorMemory.bind(index),
    };
    expect(await resolveCreatorMemory(vendor, racing, 'g:ada')).toBeUndefined();
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_late');
    expect(await index.getCreatorMemory('g:ada', 'anthropic')).toBeNull();
  });
});
