import { describe, expect, it, vi } from 'vitest';
import { InMemoryGameMemoryStore } from '../store/slices/game-memory.js';
import { resolveGameMemory } from './managed-game-memory.js';

const provider = (ids: string[]) => {
  let next = 0;
  return {
    vendor: 'anthropic',
    createMemoryStore: vi.fn(async () => ids[next++]!),
    deleteMemoryStore: vi.fn(async () => undefined),
  };
};

describe('resolveGameMemory', () => {
  it('creates the store once per game and reuses it', async () => {
    const index = new InMemoryGameMemoryStore();
    const vendor = provider(['mem_1', 'mem_2']);
    expect(await resolveGameMemory(vendor, index, 'rocks')).toBe('mem_1');
    expect(await resolveGameMemory(vendor, index, 'rocks')).toBe('mem_1');
    expect(vendor.createMemoryStore).toHaveBeenCalledTimes(1);
  });

  it('keeps the first claim and deletes the store that lost the race', async () => {
    const index = new InMemoryGameMemoryStore();
    await index.claimGameMemory({ slug: 'rocks', vendor: 'anthropic', storeId: 'mem_won', createdAt: 't' });
    const racing = { getGameMemory: async () => null, claimGameMemory: index.claimGameMemory.bind(index) };
    const vendor = provider(['mem_lost']);
    expect(await resolveGameMemory(vendor, racing, 'rocks')).toBe('mem_won');
    expect(vendor.deleteMemoryStore).toHaveBeenCalledWith('mem_lost');
  });

  it('starts without memory when unset, slugless, unsupported or failing', async () => {
    const index = new InMemoryGameMemoryStore();
    expect(await resolveGameMemory(provider(['m']), undefined, 'rocks')).toBeUndefined();
    expect(await resolveGameMemory(provider(['m']), index, undefined)).toBeUndefined();
    expect(await resolveGameMemory({ vendor: 'gemini' }, index, 'rocks')).toBeUndefined();
    const failing = { vendor: 'anthropic', createMemoryStore: async () => Promise.reject(new Error('beta off')) };
    const warn = vi.fn();
    expect(await resolveGameMemory(failing, index, 'rocks', { warn })).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
