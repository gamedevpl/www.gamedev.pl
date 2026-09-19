// Where a shelf read gets its rounds.

import { fromShelfRound, SHELF_VERSION, type ShelfDocument } from '../store/records/shelf.js';
import { noteReadTally } from '../store/read-meter.js';
import type { SubmissionRecord } from '../store/records/submission.js';

// Source grows with a creator's history; the poll does not.
export const SHELF_VERIFY_EVERY = 20;

// 'source' means the document could not answer; 'verified' is a sampled read.
export type ShelfOrigin = 'document' | 'source' | 'verified';

// Self-consistency only. Staleness needs source, which is what sampling buys.
export function documentAnswersAlone(shelf: ShelfDocument | null): shelf is ShelfDocument {
  if (!shelf) return false;
  if (shelf.version !== SHELF_VERSION) return false;
  if (shelf.truncated) return false;
  return shelf.rounds.length === shelf.sourceCount;
}

export function recordsFromShelf(shelf: ShelfDocument): SubmissionRecord[] {
  return shelf.rounds.map(fromShelfRound);
}

// Every Nth read pays source, so staleness cannot hide.
export function createShelfVerifySampler(every: number = SHELF_VERIFY_EVERY): () => boolean {
  let seen = 0;
  return () => {
    if (every <= 0) return true;
    seen += 1;
    return seen % every === 1;
  };
}

// Surfaces in the request's `firestore reads` line, next to fsReads.
export function noteShelfOrigin(origin: ShelfOrigin): void {
  noteReadTally('shelfOrigin', origin);
}
