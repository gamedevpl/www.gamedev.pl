// Gives older games the record new games get at slug settlement.

// Migration protocol: ops docs/game-ownership-and-collaboration-plan.md (GO-01).

import {
  classifyOwnerUid,
  deriveOwnerFromSubmissions,
  sameOwner,
  type GameAccessResolveStore,
} from './game-access-resolve.js';

export type GameAccessBackfillOutcome =
  'created' | 'created_platform' | 'already_recorded' | 'diverged' | 'quarantined';

export interface GameAccessBackfillResult {
  ok: true;
  dryRun: boolean;
  scanned: number;
  created: number;
  createdPlatform: number;
  alreadyRecorded: number;

  // Record disagrees with the legacy rule. The dry-run gate reads this.
  diverged: string[];

  // No live submission: no uid to record, and none guessed.
  quarantined: string[];
}

export interface GameAccessBackfillOptions {
  store: GameAccessResolveStore;
  slugs: readonly string[];
  dryRun: boolean;
  now?: () => Date;
}

// Slugs are public; uids are not. Nothing here returns one.
export async function runGameAccessBackfill(options: GameAccessBackfillOptions): Promise<GameAccessBackfillResult> {
  const { store, slugs, dryRun } = options;
  const now = options.now ?? (() => new Date());

  const result: GameAccessBackfillResult = {
    ok: true,
    dryRun,
    scanned: 0,
    created: 0,
    createdPlatform: 0,
    alreadyRecorded: 0,
    diverged: [],
    quarantined: [],
  };

  for (const slug of new Set(slugs)) {
    result.scanned += 1;
    const records = await store.listSubmissionsBySlug(slug);
    const derived = deriveOwnerFromSubmissions(records);
    const existing = await store.getGameAccess(slug);

    if (existing) {
      if (sameOwner(classifyOwnerUid(existing.ownerUid), derived)) result.alreadyRecorded += 1;
      else result.diverged.push(slug);
      continue;
    }

    if (derived.kind === 'platform' && derived.reason === 'no_owner') {
      result.quarantined.push(slug);
      continue;
    }

    const ownerUid = records.find((record) => !record.abandonedAt)?.ownerUid;
    if (!ownerUid) {
      result.quarantined.push(slug);
      continue;
    }

    if (derived.kind === 'platform') result.createdPlatform += 1;
    else result.created += 1;

    // Conditional: a record written mid-pass survives.
    if (!dryRun) await store.ensureGameAccess(slug, ownerUid, now().toISOString());
  }

  return result;
}
