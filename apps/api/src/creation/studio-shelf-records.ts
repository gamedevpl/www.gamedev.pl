import type { Store, SubmissionRecord } from '../platform/store.js';
import { ownsGame, resolveGameAccess, type GameAccessResolveStore } from '../platform/game-access-resolve.js';
import { ownsSubmissionOrSlug } from '../platform/slug-ownership.js';

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

export interface ReconcileOptions {
  // 'inherited' reads only slugs this owner authored nothing on.

  // The write path pays that; a read pays for every canonical slug.
  bySlug?: 'every-canonical' | 'inherited';
}

// listSubmissionsByOwner alone drifts after a transfer -- reconcile it.
export async function reconcileTransferredOwnership(
  store: ShelfStore,
  ownerUid: string,
  records: SubmissionRecord[],
  opts?: ReconcileOptions,
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
  const authored = new Set(records.flatMap((record) => (record.slug ? [record.slug] : [])));
  const inherited = opts?.bySlug === 'inherited';
  const read = [...canonicalSlugs].filter((slug) => !inherited || !authored.has(slug));
  const canonicalJobs = await Promise.all(read.map((slug) => store.listSubmissionsBySlug(slug)));

  // As read: this owner's rows on a game they still own.
  const own = inherited ? records.filter((r) => r.slug !== undefined && canonicalSlugs.has(r.slug)) : [];

  return [...canonicalJobs.flat(), ...own, ...kept];
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
  if (!extra) return records;
  if (!(await ownsSubmissionOrSlug(store, extra, ownerUid))) return records;
  if (extra.slug) {
    const slugJobs = await store.listSubmissionsBySlug(extra.slug);
    const jobs = slugJobs.length > 0 ? slugJobs : [extra];
    // The newest round can be an abandoned one over a live build.
    if (!jobs.some((job) => !job.abandonedAt)) return records;
    const jobIds = new Set(jobs.map((j) => j.jobId));
    return [...jobs, ...records.filter((record) => !jobIds.has(record.jobId))];
  }
  if (extra.abandonedAt) return records;
  return [extra, ...records.filter((record) => record.jobId !== extra.jobId)];
}
