import { describe, expect, it, vi } from 'vitest';
import { runShelfRebuildPass, SHELF_REBUILD_INTERVAL_MS } from './shelf-rebuild-pass.js';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');

function passStore(stale: string[], options: { throwing?: Set<string>; refusing?: Set<string> } = {}) {
  const rebuilt: string[] = [];
  const cutoffs: string[] = [];
  return {
    rebuilt,
    cutoffs,
    async listStaleShelfOwners(builtBefore: string, limit: number) {
      cutoffs.push(builtBefore);
      return stale.slice(0, limit);
    },
    async rebuildShelf(ownerUid: string) {
      if (options.throwing?.has(ownerUid)) throw new Error('nope');
      if (options.refusing?.has(ownerUid)) return false;
      rebuilt.push(ownerUid);
      return true;
    },
  };
}

describe('runShelfRebuildPass', () => {
  it('asks for shelves older than one interval, not for shelves never built', async () => {
    const store = passStore(['g:a']);
    await runShelfRebuildPass({ store, now: () => NOW });

    expect(store.cutoffs).toEqual([new Date(NOW - SHELF_REBUILD_INTERVAL_MS).toISOString()]);
  });

  it('rebuilds every stale shelf it was handed', async () => {
    const store = passStore(['g:a', 'g:b']);
    const result = await runShelfRebuildPass({ store, now: () => NOW });

    expect(store.rebuilt).toEqual(['g:a', 'g:b']);
    expect(result).toEqual({ rebuilt: 2, failed: 0 });
  });

  it('keeps going past one bad shelf, and counts it', async () => {
    const store = passStore(['g:a', 'g:bad', 'g:c'], { throwing: new Set(['g:bad']) });
    const result = await runShelfRebuildPass({ store, now: () => NOW });

    expect(store.rebuilt).toEqual(['g:a', 'g:c']);
    expect(result).toEqual({ rebuilt: 2, failed: 1 });
  });

  it('stays bounded, because it rides a two-minute job', async () => {
    const store = passStore(Array.from({ length: 50 }, (_, index) => `g:${index}`));
    await runShelfRebuildPass({ store, now: () => NOW, batch: 3 });

    expect(store.rebuilt).toHaveLength(3);
  });

  it('does nothing when no shelf is stale', async () => {
    const store = passStore([]);
    const result = await runShelfRebuildPass({ store, now: () => NOW });

    expect(result).toEqual({ rebuilt: 0, failed: 0 });
  });

  it('moves its cutoff with the clock, so the pass is due again an interval later', async () => {
    const store = passStore(['g:a']);
    const clock = vi.fn<[], number>().mockReturnValueOnce(NOW).mockReturnValueOnce(NOW + SHELF_REBUILD_INTERVAL_MS);

    await runShelfRebuildPass({ store, now: clock });
    await runShelfRebuildPass({ store, now: clock });

    // Records when the last pass ran, never that one happened.
    expect(store.cutoffs[0]).not.toEqual(store.cutoffs[1]);
    expect(store.rebuilt).toEqual(['g:a', 'g:a']);
  });

  it('counts a rebuild that wrote nothing as failed, not as repaired', async () => {
    // The mirror swallows its errors and answers false.
    const store = passStore(['g:a', 'g:quiet'], { refusing: new Set(['g:quiet']) });
    const result = await runShelfRebuildPass({ store, now: () => NOW });

    expect(store.rebuilt).toEqual(['g:a']);
    expect(result).toEqual({ rebuilt: 1, failed: 1 });
  });

  it('reports a discovery failure instead of throwing into the sweep that hosts it', async () => {
    const store = {
      async listStaleShelfOwners(): Promise<string[]> {
        throw new Error('index is having a day');
      },
      async rebuildShelf(): Promise<boolean> {
        throw new Error('never reached');
      },
    };

    await expect(runShelfRebuildPass({ store, now: () => NOW })).resolves.toEqual({
      rebuilt: 0,
      failed: 0,
      unlisted: true,
    });
  });
});
