// Where a shelf read gets its rounds.

import { fromShelfRound, SHELF_VERSION, type ShelfDocument } from '../store/records/shelf.js';
import { noteReadTally } from '../store/read-meter.js';
import type { SubmissionRecord } from '../store/records/submission.js';

// A count() checks each read, so full source stays rare.
export const SHELF_VERIFY_EVERY = 100;

// 'source' means the document could not answer; 'verified' is a sampled read.
export type ShelfOrigin = 'document' | 'source' | 'verified';

// Free checks only. A round added or removed needs the count below.
export function documentAnswersAlone(shelf: ShelfDocument | null): shelf is ShelfDocument {
  if (!shelf) return false;
  if (shelf.stale) return false;
  if (shelf.version !== SHELF_VERSION) return false;
  if (shelf.truncated) return false;
  if (shelf.ownedCount === undefined) return false;
  return shelf.rounds.length === shelf.sourceCount;
}

// One aggregation against the size the document was built from.
export function ownerCountAgrees(shelf: ShelfDocument, ownedNow: number): boolean {
  return shelf.ownedCount === ownedNow;
}

export function recordsFromShelf(shelf: ShelfDocument): SubmissionRecord[] {
  return shelf.rounds.map(fromShelfRound);
}

// A process-wide counter samples whoever polls hardest; count per owner.

// Bounded: evicting an owner only costs that owner one source read.
export const SHELF_VERIFY_OWNERS = 5000;

// Every owner's first read is verified, then every Nth of theirs.
export function createShelfVerifySampler(
  every: number = SHELF_VERIFY_EVERY,
  capacity: number = SHELF_VERIFY_OWNERS,
): (ownerUid: string) => boolean {
  const seen = new Map<string, number>();
  return (ownerUid: string) => {
    if (every <= 0) return true;
    const next = (seen.get(ownerUid) ?? 0) + 1;
    // Re-inserting moves the key last, so eviction takes the coldest.
    seen.delete(ownerUid);
    seen.set(ownerUid, next);
    if (seen.size > capacity) seen.delete(seen.keys().next().value!);
    // (next - 1) % every, so a window of one verifies every read.
    return (next - 1) % every === 0;
  };
}

// Surfaces in the request's `firestore reads` line, next to fsReads.
export function noteShelfOrigin(origin: ShelfOrigin): void {
  noteReadTally('shelfOrigin', origin);
}
