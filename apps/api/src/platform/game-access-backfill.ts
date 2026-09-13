// Gives older games the record new games get at slug settlement.

// Migration protocol: ops docs/game-ownership-and-collaboration-plan.md (GO-01).

import { fencedOut } from '../store/records/game-access.js';
import {
  classifyOwnerUid,
  deriveOwnerFromSubmissions,
  sameOwner,
  type GameAccessResolveStore,
  type GameOwner,
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

function countCreate(result: GameAccessBackfillResult, owner: GameOwner): void {
  if (owner.kind === 'platform') result.createdPlatform += 1;
  else result.created += 1;
}

// Does the record in force still agree with today's rule?
function recordOutcome(result: GameAccessBackfillResult, slug: string, ownerUid: string, derived: GameOwner): void {
  if (sameOwner(classifyOwnerUid(ownerUid), derived)) result.alreadyRecorded += 1;
  else result.diverged.push(slug);
}

async function derive(store: GameAccessResolveStore, slug: string): Promise<GameOwner> {
  return deriveOwnerFromSubmissions(await store.listSubmissionsBySlug(slug));
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
    const existing = await store.getGameAccess(slug);
    if (existing) {
      recordOutcome(result, slug, existing.ownerUid, await derive(store, slug));
      continue;
    }

    // Re-read before writing: an erasure mid-pass is not recorded.
    const fresh = await store.listSubmissionsBySlug(slug);
    const job = fresh.find((record) => !record.abandonedAt);
    if (!job?.ownerUid) {
      result.quarantined.push(slug);
      continue;
    }

    const ownerUid = job.ownerUid;
    const owner = classifyOwnerUid(ownerUid);
    const checkAccount = owner.kind === 'creator';

    // Dry run reads what the write enforces, so verdicts match.
    if (fencedOut(await store.getAccountErasure(ownerUid), job.createdAt)) {
      result.quarantined.push(slug);
      continue;
    }
    if (checkAccount && !(await store.accountExists(ownerUid))) {
      result.quarantined.push(slug);
      continue;
    }
    if (dryRun) {
      countCreate(result, owner);
      continue;
    }

    // Report the record in force, not the intended one.
    const inForce = await store.backfillGameAccess(
      slug,
      ownerUid,
      job.jobId,
      job.createdAt,
      checkAccount,
      now().toISOString(),
    );
    if (!inForce) result.quarantined.push(slug);
    else if (inForce.ownerUid === ownerUid) countCreate(result, owner);
    else recordOutcome(result, slug, inForce.ownerUid, deriveOwnerFromSubmissions(fresh));
  }

  return result;
}
