import type { SubmissionRecord } from './submission.js';

// A shelf document older than its version is rebuilt, never merged.

// 2 adds ownedCount; version 1 is repaired on sight.
export const SHELF_VERSION = 2;

// A creator this far past plausible reads from source instead.
export const MAX_SHELF_ROUNDS = 2_000;

// The fields the collapse and the shelf response actually read.
export interface ShelfRound {
  jobId: number;
  createdAt: string;
  ownerUid: string;
  title?: string;
  slug?: string;
  state?: SubmissionRecord['state'];
  abandonedAt?: string;
  publishedAt?: string;
  lastStatus?: SubmissionRecord['lastStatus'];
  lastNotifiedStatus?: SubmissionRecord['lastNotifiedStatus'];
  previewVersion?: string;
  deliveredVersion?: string;
  draftSharedAt?: string;
}

export interface ShelfDocument {
  version: number;
  builtAt: string;
  // Rounds at build time; the reader checks with count().
  sourceCount: number;

  // The ownerUid query size, so one count() checks this.
  ownedCount?: number;

  // Bumped per write; a stale rebuild elsewhere loses.
  seq?: number;

  // A tombstone: keeps seq advancing where a delete would reset it.
  stale?: true;
  rounds: ShelfRound[];
  // Past the cap, so the reader must not trust `rounds` as complete.
  truncated?: true;
}

// Firestore rejects an undefined field, so absent stays absent.
function withDefined<T extends object>(fields: T): T {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as T;
}

export function toShelfRound(record: SubmissionRecord): ShelfRound {
  return withDefined({
    jobId: record.jobId,
    createdAt: record.createdAt,
    ownerUid: record.ownerUid,
    title: record.title,
    slug: record.slug,
    state: record.state,
    abandonedAt: record.abandonedAt,
    publishedAt: record.publishedAt,
    lastStatus: record.lastStatus,
    lastNotifiedStatus: record.lastNotifiedStatus,
    previewVersion: record.previewVersion,
    deliveredVersion: record.deliveredVersion,
    draftSharedAt: record.draftSharedAt,
  });
}

// A mirrored round is a SubmissionRecord to the collapse.
export function fromShelfRound(round: ShelfRound): SubmissionRecord {
  return { ...round } as SubmissionRecord;
}

export function buildShelfDocument(
  records: readonly SubmissionRecord[],
  builtAt: string,
  ownedCount?: number,
): ShelfDocument {
  const ordered = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.jobId - a.jobId);
  const kept = ordered.slice(0, MAX_SHELF_ROUNDS);
  return {
    version: SHELF_VERSION,
    builtAt,
    // Counts the source, not what was kept.
    sourceCount: records.length,
    ...(ownedCount === undefined ? {} : { ownedCount }),
    rounds: kept.map(toShelfRound),
    ...(ordered.length > kept.length ? { truncated: true as const } : {}),
  };
}

// Deleting resets seq, letting an earlier pass win.
export function tombstoneShelf(builtAt: string, seq: number): ShelfDocument {
  // Self-consistent otherwise, so `stale` alone rejects it.
  return { version: SHELF_VERSION, builtAt, sourceCount: 0, ownedCount: 0, rounds: [], stale: true, seq };
}

// Usable means this reader may answer from it without reading source.
export function isShelfUsable(shelf: ShelfDocument | null, sourceCount: number): boolean {
  if (!shelf) return false;
  if (shelf.stale) return false;
  if (shelf.version !== SHELF_VERSION) return false;
  if (shelf.truncated) return false;
  return shelf.sourceCount === sourceCount;
}
