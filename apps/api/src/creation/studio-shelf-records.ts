import type { Store, SubmissionRecord } from '../platform/store.js';
import { ownsGame, resolveGameAccess, type GameAccessResolveStore } from '../platform/game-access-resolve.js';

export type ShelfStore = Pick<Store, 'listSubmissionsByOwner' | 'getSubmissionBySlug' | 'getSubmission'> &
  GameAccessResolveStore &
  Pick<Store, 'listGameAccessByMember'>;

// Judged before the deep-link merge adds its record.
export type ShelfRecordsObserver = (records: SubmissionRecord[]) => Promise<void>;

function jobIdFromToken(token: string): number | null {
  try {
    const [raw] = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (!raw || !/^\d+$/.test(raw)) return null;
    const jobId = Number.parseInt(raw, 10);
    return Number.isSafeInteger(jobId) && jobId > 0 ? jobId : null;
  } catch {
    return null;
  }
}

async function lookupRequested(
  store: ShelfStore,
  requested: string,
  mintStatusToken: (jobId: number) => string,
): Promise<SubmissionRecord | null> {
  const bySlug = await store.getSubmissionBySlug(requested);
  if (bySlug) return bySlug;
  const jobId = jobIdFromToken(requested);
  if (!jobId || mintStatusToken(jobId) !== requested) return null;
  return store.getSubmission(jobId);
}

// listSubmissionsByOwner alone drifts after a transfer -- reconcile it.
export async function reconcileTransferredOwnership(
  store: ShelfStore,
  ownerUid: string,
  records: SubmissionRecord[],
): Promise<SubmissionRecord[]> {
  const memberAccess = await store.listGameAccessByMember(ownerUid);
  const canonicalSlugs = new Set(memberAccess.filter((a) => a.ownerUid === ownerUid).map((a) => a.slug));

  const nonCanonical = records.filter((r) => !r.slug || !canonicalSlugs.has(r.slug));
  const stillOwned = await Promise.all(
    nonCanonical.map(async (record) => {
      if (!record.slug) return true;
      const access = await resolveGameAccess(store, record.slug);
      return access.source !== 'canonical' || ownsGame(access, ownerUid);
    }),
  );
  const kept = nonCanonical.filter((_, i) => stillOwned[i]);

  // Every job on the slug, not just this owner's historical rows.
  const canonicalJobs = await Promise.all([...canonicalSlugs].map((slug) => store.listSubmissionsBySlug(slug)));

  return [...canonicalJobs.flat(), ...kept];
}

// Owner-query lag: document GET still finds a just-written draft.
export async function loadShelfRecords(
  store: ShelfStore,
  ownerUid: string,
  requested: string | undefined,
  mintStatusToken: (jobId: number) => string,
  observe?: ShelfRecordsObserver,
): Promise<SubmissionRecord[]> {
  const owned = await store.listSubmissionsByOwner(ownerUid);
  const records = await reconcileTransferredOwnership(store, ownerUid, owned);
  if (observe) await observe(records);
  if (!requested) return records;
  const known = records.some((record) => record.slug === requested || mintStatusToken(record.jobId) === requested);
  if (known) return records;

  const extra = await lookupRequested(store, requested, mintStatusToken);
  if (!extra || extra.ownerUid !== ownerUid || extra.abandonedAt) return records;
  return [extra, ...records.filter((record) => record.jobId !== extra.jobId)];
}
