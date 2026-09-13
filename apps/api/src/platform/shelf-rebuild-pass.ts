// The floor under the write-through.

// Records when the last pass ran, never that one happened.

// Why that matters on a rollback: docs/firestore-read-cost.md.

export const SHELF_REBUILD_INTERVAL_MS = 60 * 60_000;

// Bounded per run: this rides a two-minute job.
export const SHELF_REBUILD_BATCH = 10;

export interface ShelfRebuildStore {
  listStaleShelfOwners(builtBefore: string, limit: number): Promise<string[]>;
  rebuildShelf(ownerUid: string): Promise<void>;
}

export interface ShelfRebuildPassOptions {
  store: ShelfRebuildStore;
  now: () => number;
  intervalMs?: number;
  batch?: number;
}

export interface ShelfRebuildPassResult {
  rebuilt: number;
  failed: number;
}

export async function runShelfRebuildPass(options: ShelfRebuildPassOptions): Promise<ShelfRebuildPassResult> {
  const intervalMs = options.intervalMs ?? SHELF_REBUILD_INTERVAL_MS;
  const cutoff = new Date(options.now() - intervalMs).toISOString();
  const owners = await options.store.listStaleShelfOwners(cutoff, options.batch ?? SHELF_REBUILD_BATCH);
  let rebuilt = 0;
  let failed = 0;
  for (const ownerUid of owners) {
    try {
      await options.store.rebuildShelf(ownerUid);
      rebuilt += 1;
    } catch {
      // One bad shelf must not stop the pass.
      failed += 1;
    }
  }
  return { rebuilt, failed };
}
