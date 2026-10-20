import { describe, expect, it, vi } from 'vitest';
import { InMemoryCreatorMemoryStore } from '../store/slices/creator-memory.js';
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
    const index = new InMemoryCreatorMemoryStore();
    const vendor = provider(['mem_1', 'mem_2']);
    expect(await resolveCreatorMemory(vendor, index, 'g:ada')).toBe('mem_1');
    expect(await resolveCreatorMemory(vendor, index, 'g:ada')).toBe('mem_1');
    expect(await resolveCreatorMemory(vendor, index, 'g:bob')).toBe('mem_2');
    expect(vendor.createMemoryStore).toHaveBeenCalledTimes(2);
  });

  it('names the store by an opaque label, never the uid', async () => {
    const vendor = provider(['mem_1']);
    await resolveCreatorMemory(vendor, new InMemoryCreatorMemoryStore(), 'g:ada');
    const [label] = vendor.createMemoryStore.mock.calls[0]!;
    expect(label).toBe(creatorMemoryLabel('g:ada'));
    expect(label).toMatch(/^[0-9a-f]{16}$/);
    expect(label).not.toContain('ada');
  });

  it('keeps the first claim and deletes the store that lost the race', async () => {
    const index = new InMemoryCreatorMemoryStore();
    await index.claimCreatorMemory({ ownerUid: 'g:ada', vendor: 'anthropic', storeId: 'mem_won', createdAt: 't' });
    const racing = { getCreatorMemory: async () => null, claimCreatorMemory: index.claimCreatorMemory.bind(index) };
    const vendor = provider(['mem_lost']);
    expect(await resolveCreatorMemory(vendor, racing, 'g:ada')).toBe('mem_won');
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_lost');
  });

  it('deletes a created store when recording it fails', async () => {
    const vendor = provider(['mem_orphan']);
    const broken = {
      getCreatorMemory: async () => null,
      claimCreatorMemory: async () => Promise.reject(new Error('firestore down')),
    };
    expect(await resolveCreatorMemory(vendor, broken, 'g:ada')).toBeUndefined();
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_orphan');
  });

  it('starts without memory when unset, ownerless, unsupported or failing', async () => {
    const index = new InMemoryCreatorMemoryStore();
    expect(await resolveCreatorMemory(provider(['m']), undefined, 'g:ada')).toBeUndefined();
    expect(await resolveCreatorMemory(provider(['m']), index, undefined)).toBeUndefined();
    expect(await resolveCreatorMemory({ vendor: 'gemini' }, index, 'g:ada')).toBeUndefined();
    const failing = { vendor: 'anthropic', createMemoryStore: async () => Promise.reject(new Error('beta off')) };
    const warn = vi.fn();
    expect(await resolveCreatorMemory(failing, index, 'g:ada', { warn })).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
