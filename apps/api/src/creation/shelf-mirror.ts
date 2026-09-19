import { buildShelfDocument, type ShelfDocument } from '../store/records/shelf.js';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import { reconcileTransferredOwnership, type ShelfStore } from './studio-shelf-records.js';

// Structural, not Pick<Store>: the store builds the mirror.
export type ShelfMirrorStore = ShelfStore & {
  putShelfIfUnchanged(ownerUid: string, shelf: ShelfDocument, expectedSeq: number): Promise<boolean>;
  tombstoneShelf(ownerUid: string, builtAt: string): Promise<void>;
  deleteShelf(ownerUid: string): Promise<void>;
};

export interface ShelfMirrorOptions {
  store: ShelfMirrorStore;
  now: () => number;
  // Best-effort: a mirror failure must never fail the write it followed.
  onError?: (error: unknown, context: { ownerUid?: string; jobId?: number }) => void;
}

export interface ShelfMirror {
  // The document written, or null when nothing could be.
  rebuild(ownerUid: string): Promise<ShelfDocument | null>;
  // The writers know a job, not an owner.
  afterJobWrite(jobId: number): Promise<void>;
  forget(ownerUid: string): Promise<void>;
  pending(): number;
}

// Exhausting these means giving up and serving nothing.
const REBUILD_ATTEMPTS = 3;

export function createShelfMirror(options: ShelfMirrorOptions): ShelfMirror {
  const { store, now } = options;
  const inFlight = new Map<string, Promise<ShelfDocument | null>>();
  // Written to mid-rebuild: that pass may be behind.
  const requeued = new Set<string>();

  const report = (error: unknown, context: { ownerUid?: string; jobId?: number }) => {
    options.onError?.(error, context);
  };

  async function rebuildNow(ownerUid: string): Promise<ShelfDocument | null> {
    // First writer wins, not freshest reader, so reread on a loss.
    for (let attempt = 0; attempt < REBUILD_ATTEMPTS; attempt += 1) {
      // Read before source, so a write in between is seen.
      const seq = (await store.getShelf(ownerUid))?.seq ?? 0;
      const owned = await store.listSubmissionsByOwner(ownerUid);

      // Mirror reconciles ownership identically to the shelf route.
      const records = await reconcileTransferredOwnership(store, ownerUid, owned);
      const shelf = buildShelfDocument(records, new Date(now()).toISOString(), owned.length);
      if (await store.putShelfIfUnchanged(ownerUid, shelf, seq)) return shelf;
    }

    // Stored by a pass this cannot order itself against: serve nothing.
    report(new Error('shelf rebuild lost the sequence race'), { ownerUid });
    await discard(ownerUid);
    return null;
  }

  // A delete resets seq, so an earlier pass would win.
  async function discard(ownerUid: string): Promise<void> {
    try {
      await store.tombstoneShelf(ownerUid, new Date(now()).toISOString());
    } catch (error) {
      report(error, { ownerUid });
    }
  }

  function rebuild(ownerUid: string): Promise<ShelfDocument | null> {
    // A burst of writes costs one rebuild, not one each.
    const running = inFlight.get(ownerUid);
    if (running) {
      // The running pass may have read source already.
      requeued.add(ownerUid);
      return running;
    }
    const work = (async () => {
      // Loops, not recurses, so writes cannot grow the stack.
      for (;;) {
        requeued.delete(ownerUid);
        let built: ShelfDocument | null = null;
        try {
          built = await rebuildNow(ownerUid);
        } catch (error) {
          report(error, { ownerUid });
          // A rebuild follows revocations too: a kept document serves a lost game.
          await discard(ownerUid);
        }
        if (!requeued.has(ownerUid)) return built;
      }
    })().finally(() => {
      requeued.delete(ownerUid);
      inFlight.delete(ownerUid);
    });
    inFlight.set(ownerUid, work);
    return work;
  }

  return {
    rebuild,
    async afterJobWrite(jobId) {
      try {
        const record = await store.getSubmission(jobId);
        if (!record?.ownerUid) return;

        // The author's shelf still lists it until it is rebuilt too.
        const owners = new Set([record.ownerUid]);
        const editors = new Set<string>();
        if (record.slug) {
          const access = await resolveGameAccess(store, record.slug);
          owners.add(access.owner.kind === 'creator' ? access.owner.uid : record.ownerUid);
          for (const uid of access.editorUids) editors.add(uid);
        }
        for (const ownerUid of owners) await rebuild(ownerUid);

        // A co-editor's own count never moves; only this does.

        // Tombstoned, not rebuilt: writes outpace a collaborator's reads.
        for (const uid of editors) {
          if (!owners.has(uid)) await discard(uid);
        }
      } catch (error) {
        report(error, { jobId });
      }
    },
    async forget(ownerUid) {
      try {
        await store.deleteShelf(ownerUid);
      } catch (error) {
        report(error, { ownerUid });
      }
    },
    pending() {
      return inFlight.size;
    },
  };
}
