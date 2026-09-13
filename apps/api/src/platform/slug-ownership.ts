import { gameAccessAuthoritative } from './game-access-cutover.js';
import { ownsGame, resolveGameAccess } from './game-access-resolve.js';
import { mintGameSlug } from './slug.js';
import type { Store, SubmissionRecord } from './store.js';

// Whether anything answers to this name; `except` excuses one record.
export type SlugClaimProbe = (slug: string, except?: number) => Promise<boolean>;

// The store calls settling a claim needs.
export interface SlugClaimStore {
  setSubmissionSlug(jobId: number, slug: string): Promise<void>;
  getSubmissionBySlug(slug: string): Promise<SubmissionRecord | null>;

  // The name stops moving here, so authority is recorded here.
  recordSettledOwner(
    slug: string,
    ownerUid: string,
    jobId: number,
    workAt: string,
    at: string,
  ): Promise<{ ownerUid: string; settledJobId?: number } | null>;
}

// Reads back a slug a job wrote, settling who holds it.

// getSubmissionBySlug is the same oracle every later lookup uses.

// Returns the settled slug, or null when the retry also lost.
export async function settleSlugClaim(
  store: SlugClaimStore,
  jobId: number,
  slug: string,
  title: string,
  isSlugClaimed: SlugClaimProbe,
): Promise<string | null> {
  const holds = async (candidate: string): Promise<boolean> => {
    const holder = await store.getSubmissionBySlug(candidate);
    if (holder?.jobId !== jobId) return false;
    if (!holder.ownerUid) return true;

    // A newer job settled while we waited: we lost, late.
    const inForce = await store.recordSettledOwner(
      candidate,
      holder.ownerUid,
      jobId,
      holder.createdAt,
      new Date().toISOString(),
    );

    // Refused leaves the name ours; another owner does not.
    if (!inForce) return true;
    if (inForce.ownerUid !== holder.ownerUid) return false;
    return inForce.settledJobId === undefined || inForce.settledJobId === jobId;
  };

  if (await holds(slug)) return slug;

  // Lost: mint again, treating anything we do not hold as taken.
  const retry = await mintGameSlug(title, async (candidate) => {
    if (candidate === slug) return true;
    return isSlugClaimed(candidate, jobId);
  });
  await store.setSubmissionSlug(jobId, retry);
  return (await holds(retry)) ? retry : null;
}

// Owns = newest non-abandoned submission for the slug is theirs.

// Abandoned rounds are skipped so a cancel cannot unown a published game.

// Flag off: the historical derived rule, unchanged.

// Flag on: the canonical GameAccess record, so transfers work.
export async function creatorOwnsSlug(
  store: Store,
  slug: string,
  creatorUid: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (gameAccessAuthoritative(env)) {
    return ownsGame(await resolveGameAccess(store, slug), creatorUid);
  }
  const records = await store.listSubmissionsBySlug(slug);
  const newestLive = records.find((record) => !record.abandonedAt);
  return newestLive !== undefined && newestLive.ownerUid === creatorUid;
}

// record.ownerUid is right until a slug can transfer ownership.

// Past that, a stale record.ownerUid must not outrank the canonical one.
export async function ownsSubmissionOrSlug(
  store: Store,
  record: { ownerUid: string | null; slug?: SubmissionRecord['slug'] },
  uid: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!record.slug) return record.ownerUid === uid;
  if (!gameAccessAuthoritative(env)) return record.ownerUid === uid;
  return creatorOwnsSlug(store, record.slug, uid, env);
}

// The rounds a uid may see for a slug: their own rounds.

// Post-transfer, only the new canonical owner sees any of them.
export async function listAuthorizedRoundsForSlug(
  store: Store,
  uid: string,
  slug: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SubmissionRecord[]> {
  const own = await store.listSubmissionsByOwnerAndSlug(uid, slug);
  if (!gameAccessAuthoritative(env)) return own;
  if (!(await creatorOwnsSlug(store, slug, uid, env))) return [];
  return own.length > 0 ? own : store.listSubmissionsBySlug(slug);
}
