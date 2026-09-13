// The floor under the write-through.

// Records when the last pass ran, never that one happened.

// Why that matters on a rollback: docs/firestore-read-cost.md.

export const SHELF_REBUILD_INTERVAL_MS = 60 * 60_000;

// Bounded per run: this rides a two-minute job.
export const SHELF_REBUILD_BATCH = 10;

export interface ShelfRebuildStore {
  listStaleShelfOwners(builtBefore: string, limit: number): Promise<string[]>;
  // False when the rebuild could not write; the mirror does not throw.
  rebuildShelf(ownerUid: string): Promise<boolean>;
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
  // True when the pass could not even list what was stale.
  unlisted?: true;
}

export async function runShelfRebuildPass(options: ShelfRebuildPassOptions): Promise<ShelfRebuildPassResult> {
  const intervalMs = options.intervalMs ?? SHELF_REBUILD_INTERVAL_MS;
  const cutoff = new Date(options.now() - intervalMs).toISOString();
  let owners: string[];
  try {
    owners = await options.store.listStaleShelfOwners(cutoff, options.batch ?? SHELF_REBUILD_BATCH);
  } catch {
    // Derived state riding a notification job, so never throw.
    return { rebuilt: 0, failed: 0, unlisted: true };
  }
  let rebuilt = 0;
  let failed = 0;
  for (const ownerUid of owners) {
    try {
      // False is a failure the mirror already swallowed.
      if (await options.store.rebuildShelf(ownerUid)) rebuilt += 1;
      else failed += 1;
    } catch {
      // One bad shelf must not stop the pass.
      failed += 1;
    }
  }
  return { rebuilt, failed };
}
