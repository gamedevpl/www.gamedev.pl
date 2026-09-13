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
    at: string,
  ): Promise<{ settledJobId?: number } | null>;
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
    const inForce = await store.recordSettledOwner(candidate, holder.ownerUid, jobId, new Date().toISOString());
    if (!inForce) return true;
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
export async function creatorOwnsSlug(store: Store, slug: string, creatorUid: string): Promise<boolean> {
  const records = await store.listSubmissionsBySlug(slug);
  const newestLive = records.find((record) => !record.abandonedAt);
  return newestLive !== undefined && newestLive.ownerUid === creatorUid;
}
