import { buildShelfDocument, type ShelfDocument } from '../store/records/shelf.js';
import type { SubmissionRecord } from '../store/records/submission.js';

// Structural, not Pick<Store>: the store builds the mirror.
export interface ShelfMirrorStore {
  listSubmissionsByOwner(ownerUid: string): Promise<SubmissionRecord[]>;
  getSubmission(jobId: number): Promise<SubmissionRecord | null>;
  putShelf(ownerUid: string, shelf: ShelfDocument): Promise<void>;
  deleteShelf(ownerUid: string): Promise<void>;
}

export interface ShelfMirrorOptions {
  store: ShelfMirrorStore;
  now: () => number;
  // Best-effort: a mirror failure must never fail the write it followed.
  onError?: (error: unknown, context: { ownerUid?: string; jobId?: number }) => void;
}

export interface ShelfMirror {
  rebuild(ownerUid: string): Promise<ShelfDocument | null>;
  // The writers know a job, not an owner.
  afterJobWrite(jobId: number): Promise<void>;
  forget(ownerUid: string): Promise<void>;
  pending(): number;
}

export function createShelfMirror(options: ShelfMirrorOptions): ShelfMirror {
  const { store, now } = options;
  const inFlight = new Map<string, Promise<ShelfDocument | null>>();

  const report = (error: unknown, context: { ownerUid?: string; jobId?: number }) => {
    options.onError?.(error, context);
  };

  async function rebuildNow(ownerUid: string): Promise<ShelfDocument | null> {
    const records = await store.listSubmissionsByOwner(ownerUid);
    const shelf = buildShelfDocument(records, new Date(now()).toISOString());
    await store.putShelf(ownerUid, shelf);
    return shelf;
  }

  function rebuild(ownerUid: string): Promise<ShelfDocument | null> {
    // A burst of writes costs one rebuild, not one each.
    const running = inFlight.get(ownerUid);
    if (running) return running;
    const work = rebuildNow(ownerUid)
      .catch((error: unknown) => {
        report(error, { ownerUid });
        return null;
      })
      .finally(() => {
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
        await rebuild(record.ownerUid);
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
