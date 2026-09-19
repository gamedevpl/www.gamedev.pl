import type { Store, SubmissionRecord } from '../platform/store.js';
import type { GameAccessRecord } from '../store/records/game-access.js';
import { resolveGameAccess, type GameAccessResolveStore } from '../platform/game-access-resolve.js';
import { canActOnSubmissionOrSlug, isGameMember } from '../platform/game-access-permissions.js';
import { documentAnswersAlone, noteShelfOrigin, ownerCountAgrees, recordsFromShelf } from './shelf-source.js';

export type ShelfStore = Pick<
  Store,
  | 'listSubmissionsByOwner'
  | 'getSubmissionBySlug'
  | 'getSubmission'
  | 'countSubmissionsBySlug'
  | 'getShelf'
  | 'countSubmissionsByOwner'
> &
  GameAccessResolveStore &
  Pick<Store, 'listGameAccessByMember'>;

// Judged before the deep-link merge adds its record.
export type ShelfRecordsObserver = (records: SubmissionRecord[], ownedNow?: number) => Promise<void>;

// `verify` decides which reads pay source anyway; absent means never.
export interface ShelfReadOptions {
  fromDocument: boolean;
  verify?: (ownerUid: string) => boolean;
}

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

// Cheap pre-filter; another uid may hold rounds this owner cannot see.
export function ownerQueryCoversAccess(
  access: GameAccessRecord,
  ownerUid: string,
  owned: readonly Pick<SubmissionRecord, 'slug'>[],
): boolean {
  return (
    access.ownerUid === ownerUid &&
    access.accessRevision === 1 &&
    access.editorUids.length === 0 &&
    access.capabilitiesRevokedAtRevision === undefined &&
    access.memberRevocations === undefined &&
    owned.some((record) => record.slug === access.slug)
  );
}

// The predicate guesses; a count proves it, for one read.
async function slugRounds(
  store: ShelfStore,
  access: GameAccessRecord,
  ownerUid: string,
  records: SubmissionRecord[],
): Promise<SubmissionRecord[]> {
  if (!ownerQueryCoversAccess(access, ownerUid, records)) return store.listSubmissionsBySlug(access.slug);
  const mine = records.filter((record) => record.slug === access.slug);
  const total = await store.countSubmissionsBySlug(access.slug);
  if (total === mine.length) return mine;
  return store.listSubmissionsBySlug(access.slug);
}

// listSubmissionsByOwner alone drifts after a transfer -- reconcile it.
export async function reconcileTransferredOwnership(
  store: ShelfStore,
  ownerUid: string,
  records: SubmissionRecord[],
): Promise<SubmissionRecord[]> {
  const memberAccess = await store.listGameAccessByMember(ownerUid);
  const canonicalSlugs = new Set(memberAccess.map((a) => a.slug));

  const nonCanonical = records.filter((r) => !r.slug || !canonicalSlugs.has(r.slug));
  const stillOwned = await Promise.all(
    nonCanonical.map(async (record) => {
      if (!record.slug) return true;
      const access = await resolveGameAccess(store, record.slug);
      return access.source !== 'canonical' || isGameMember(access, ownerUid);
    }),
  );
  const kept = nonCanonical.filter((_, i) => stillOwned[i]);

  const canonicalJobs = await Promise.all(memberAccess.map((access) => slugRounds(store, access, ownerUid, records)));

  return [...canonicalJobs.flat(), ...kept];
}

// Reconciling source costs one read per round; the document costs one.
export async function readOwnerShelfRecords(
  store: ShelfStore,
  ownerUid: string,
  observe: ShelfRecordsObserver | undefined,
  read: ShelfReadOptions | undefined,
): Promise<SubmissionRecord[]> {
  const fromSource = async (ownedNow?: number): Promise<SubmissionRecord[]> => {
    const owned = await store.listSubmissionsByOwner(ownerUid);
    const records = await reconcileTransferredOwnership(store, ownerUid, owned);
    // The shadow judges the document against these, and backfills an absent one.

    // owned.length is the raw count; sampled reads must catch drift too.
    if (observe) await observe(records, ownedNow ?? owned.length);
    return records;
  };

  if (!read?.fromDocument) {
    noteShelfOrigin('source');
    return fromSource();
  }
  // Sampled reads answer from source: caught and repaired at once.
  if (read.verify?.(ownerUid)) {
    noteShelfOrigin('verified');
    return fromSource();
  }
  // The document is derived state: if checking it fails, source still answers.
  let ownedNow: number;
  let shelf: Awaited<ReturnType<typeof store.getShelf>>;
  try {
    // One aggregation catches a round added or removed since the build.
    ownedNow = await store.countSubmissionsByOwner(ownerUid);

    // Read last: it carries access, which the count cannot see.
    shelf = await store.getShelf(ownerUid);
  } catch {
    noteShelfOrigin('source');
    return fromSource();
  }
  if (!documentAnswersAlone(shelf) || !ownerCountAgrees(shelf, ownedNow)) {
    noteShelfOrigin('source');
    // With the count, or a matching collapse reads 'match' and never repairs.
    return fromSource(ownedNow);
  }
  noteShelfOrigin('document');
  return recordsFromShelf(shelf);
}

// Owner-query lag: document GET still finds a just-written draft.
export async function loadShelfRecords(
  store: ShelfStore,
  ownerUid: string,
  requested: string | undefined,
  mintStatusToken: (jobId: number) => string,
  observe?: ShelfRecordsObserver,
  read?: ShelfReadOptions,
): Promise<SubmissionRecord[]> {
  const records = await readOwnerShelfRecords(store, ownerUid, observe, read);
  if (!requested) return records;
  const known = records.some((record) => record.slug === requested || mintStatusToken(record.jobId) === requested);
  if (known) return records;

  const extra = await lookupRequested(store, requested, mintStatusToken);
  if (!extra) return records;
  if (!(await canActOnSubmissionOrSlug(store, extra, ownerUid, 'read'))) return records;
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
