// The in-memory seam every slice already writes through.

// Slices share one Map, so guarding it guards them all.

import { shelfRoundChanged, tombstoneShelf, type ShelfDocument } from './records/shelf.js';
import type { SubmissionRecord } from './records/submission.js';

export interface ShelfGuardHooks {
  // Every member of the game, so co-editors go too.
  membersOfSlug(slug: string): readonly string[];
  // Owners of any round carrying the slug, rival claimants included.
  claimantsOfSlug(slug: string): readonly string[];
  tombstone(ownerUid: string): void;
}

// Resolved lazily: the store's shelves map is built after this one.
export type ShelfGuardHooksSource = () => ShelfGuardHooks;

function affectedOwners(hooks: ShelfGuardHooks, rounds: readonly (SubmissionRecord | undefined)[]): Set<string> {
  const uids = new Set<string>();
  for (const round of rounds) {
    if (!round) continue;
    if (round.ownerUid) uids.add(round.ownerUid);
    if (round.slug) for (const uid of hooks.membersOfSlug(round.slug)) uids.add(uid);
  }
  return uids;
}

// One object, handed to every slice, so a new slice inherits this.

// The nine bugs #1416 fixed were nine slices that each remembered.
export class GuardedSubmissions extends Map<number, SubmissionRecord> {
  constructor(private readonly hooks: ShelfGuardHooksSource) {
    super();
  }

  override set(jobId: number, record: SubmissionRecord): this {
    const before = super.get(jobId);
    super.set(jobId, record);
    // A create moves the owner's count, which no field diff shows.
    if (!before || shelfRoundChanged(before, record)) this.invalidate([before, record]);
    return this;
  }

  override delete(jobId: number): boolean {
    const before = super.get(jobId);
    const removed = super.delete(jobId);
    if (removed) this.invalidate([before]);
    return removed;
  }

  override clear(): void {
    const rounds = [...super.values()];
    super.clear();
    this.invalidate(rounds);
  }

  private invalidate(rounds: readonly (SubmissionRecord | undefined)[]): void {
    const hooks = this.hooks();
    for (const uid of affectedOwners(hooks, rounds)) hooks.tombstone(uid);
  }
}

// Membership is what the reader's ownedCount fence cannot see.

// So every write counts; no field diff is worth attempting.
export class GuardedGameAccess<
  T extends { ownerUid: string; memberUids?: string[]; editorUids?: string[] },
> extends Map<string, T> {
  constructor(private readonly hooks: ShelfGuardHooksSource) {
    super();
  }

  override set(slug: string, record: T): this {
    const before = super.get(slug);
    super.set(slug, record);
    this.invalidate(slug, [before, record]);
    return this;
  }

  override delete(slug: string): boolean {
    const before = super.get(slug);
    const removed = super.delete(slug);
    if (removed) this.invalidate(slug, [before]);
    return removed;
  }

  private invalidate(slug: string, records: readonly (T | undefined)[]): void {
    const hooks = this.hooks();
    const uids = new Set<string>();
    for (const record of records) {
      if (!record) continue;
      uids.add(record.ownerUid);
      for (const uid of record.memberUids ?? []) uids.add(uid);
      for (const uid of record.editorUids ?? []) uids.add(uid);
    }
    // Canonical access drops the slug from every non-member's shelf.
    for (const uid of hooks.claimantsOfSlug(slug)) uids.add(uid);
    for (const uid of uids) hooks.tombstone(uid);
  }
}

// Read at write time, so the store's field order cannot matter.
export class MemoryShelfGuard {
  readonly shelves = new Map<string, ShelfDocument>();

  constructor(
    private readonly access: () => Map<string, { memberUids?: string[] }>,
    private readonly rounds: () => Iterable<SubmissionRecord>,
  ) {}

  // A tombstone, never a delete: a delete resets seq.
  tombstoneAt(ownerUid: string, at: string): void {
    this.shelves.set(ownerUid, tombstoneShelf(at, (this.shelves.get(ownerUid)?.seq ?? 0) + 1));
  }

  hooks(): ShelfGuardHooks {
    return {
      membersOfSlug: (slug) => this.access().get(slug)?.memberUids ?? [],
      claimantsOfSlug: (slug) => [...this.rounds()].flatMap((r) => (r.slug === slug ? [r.ownerUid] : [])),
      tombstone: (ownerUid) => this.tombstoneAt(ownerUid, new Date().toISOString()),
    };
  }
}
