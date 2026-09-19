// Shadow read: source still answers, the document is only judged against it.

// The bar for flipping readers over is zero mismatches over a week.

import { collapseJobsToOwnerGames } from './owner-games.js';
import { fromShelfRound, isShelfUsable, SHELF_VERSION, type ShelfDocument } from '../store/records/shelf.js';
import { noteReadTally } from '../store/read-meter.js';
import type { SubmissionRecord } from '../store/records/submission.js';

export interface ShelfShadowStore {
  getShelf(ownerUid: string): Promise<ShelfDocument | null>;
  // Coalesced per owner by the mirror; see the 'absent' backfill below.
  rebuildShelf(ownerUid: string): Promise<boolean>;
}

// Absent and stale are reported too, not hidden.
export type ShelfShadowVerdict = 'match' | 'absent' | 'version' | 'truncated' | 'count' | 'collapse';

export interface ShelfShadowResult {
  verdict: ShelfShadowVerdict;
  sourceCount: number;
  shelfCount?: number;
}

// Every tip field either shelf response serves, or the bar means nothing.
function collapsedFingerprint(records: readonly SubmissionRecord[]): string {
  return collapseJobsToOwnerGames(records, 'shelf')
    .map(({ tip, catalogPublishedAt }) =>
      [
        tip.jobId,
        tip.createdAt,
        tip.slug ?? '',
        tip.title ?? '',
        tip.lastStatus ?? tip.lastNotifiedStatus ?? '',
        tip.publishedAt ?? '',
        tip.previewVersion ?? '',
        tip.deliveredVersion ?? '',
        tip.draftSharedAt ?? '',
        catalogPublishedAt ?? '',
      ].join('~'),
    )
    .join('|');
}

export function judgeShelfShadow(
  shelf: ShelfDocument | null,
  sourceRecords: readonly SubmissionRecord[],
  sourceCount: number,
): ShelfShadowResult {
  if (!shelf) return { verdict: 'absent', sourceCount };
  if (shelf.version !== SHELF_VERSION) return { verdict: 'version', sourceCount, shelfCount: shelf.sourceCount };
  if (shelf.truncated) return { verdict: 'truncated', sourceCount, shelfCount: shelf.sourceCount };
  if (!isShelfUsable(shelf, sourceCount)) return { verdict: 'count', sourceCount, shelfCount: shelf.sourceCount };
  const mirrored = shelf.rounds.map(fromShelfRound);
  const same = collapsedFingerprint(mirrored) === collapsedFingerprint(sourceRecords);
  return { verdict: same ? 'match' : 'collapse', sourceCount, shelfCount: shelf.sourceCount };
}

export interface ShelfShadowDeps {
  store: ShelfShadowStore;
  log: { warn: (context: object, message: string) => void };
}

// Never throws, never changes the answer.
export async function recordShelfShadow(
  deps: ShelfShadowDeps,
  ownerUid: string,
  sourceRecords: readonly SubmissionRecord[],
): Promise<ShelfShadowResult | null> {
  try {
    // The caller already reconciled these; counting them again costs a second pass.
    const shelf = await deps.store.getShelf(ownerUid);
    const result = judgeShelfShadow(shelf, sourceRecords, sourceRecords.length);
    noteReadTally('shelfShadow', result.verdict);
    if (result.verdict !== 'match') {
      noteReadTally('shelfMismatch', true);
      deps.log.warn({ ownerUid, ...result }, 'shelf shadow mismatch');
    }
    // Absent is unreachable by write-through or the hourly pass alike.
    if (result.verdict === 'absent') await backfillAbsentShelf(deps, ownerUid);
    return result;
  } catch (error) {
    noteReadTally('shelfShadow', 'error');
    deps.log.warn({ ownerUid, err: error }, 'shelf shadow check failed');
    return null;
  }
}

// Awaited: unawaited work here can be suspended after the response ships.

// A lost repair is silent -- the next poll just says 'absent' again.

// The mirror answers false on failure rather than rejecting; check both.
async function backfillAbsentShelf(deps: ShelfShadowDeps, ownerUid: string): Promise<void> {
  const backfilled = await deps.store.rebuildShelf(ownerUid).catch((error: unknown) => {
    deps.log.warn({ ownerUid, err: error }, 'shelf lazy backfill errored');
    return false;
  });
  if (!backfilled) deps.log.warn({ ownerUid }, 'shelf lazy backfill wrote nothing');
}
