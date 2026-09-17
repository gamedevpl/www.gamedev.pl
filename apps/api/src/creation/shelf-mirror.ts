import { buildShelfDocument, type ShelfDocument } from '../store/records/shelf.js';
import { currentOwnerUid } from '../platform/game-access-resolve.js';
import { reconcileTransferredOwnership, type ShelfStore } from './studio-shelf-records.js';

// Structural, not Pick<Store>: the store builds the mirror.
export type ShelfMirrorStore = ShelfStore & {
  putShelf(ownerUid: string, shelf: ShelfDocument): Promise<void>;
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

export function createShelfMirror(options: ShelfMirrorOptions): ShelfMirror {
  const { store, now } = options;
  const inFlight = new Map<string, Promise<ShelfDocument | null>>();
  // Written to mid-rebuild: that pass may be behind.
  const requeued = new Set<string>();

  const report = (error: unknown, context: { ownerUid?: string; jobId?: number }) => {
    options.onError?.(error, context);
  };

  async function rebuildNow(ownerUid: string): Promise<ShelfDocument | null> {
    const owned = await store.listSubmissionsByOwner(ownerUid);

    // Mirror reconciles ownership identically to the shelf route.
    const records = await reconcileTransferredOwnership(store, ownerUid, owned);
    const shelf = buildShelfDocument(records, new Date(now()).toISOString());
    await store.putShelf(ownerUid, shelf);
    return shelf;
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
        if (record.slug) {
          const owner = await currentOwnerUid(store, record.slug, record.ownerUid);
          if (owner) owners.add(owner);
        }
        for (const ownerUid of owners) await rebuild(ownerUid);
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
