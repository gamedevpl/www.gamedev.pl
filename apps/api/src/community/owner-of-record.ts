// Who decides what happens to a game.
//
// Every proposal has to reach exactly one reviewer, and the catalog makes that harder
// than it sounds: it has two lanes with different notions of ownership. A creator game is
// owned through its jobs — the newest non-abandoned submission for the slug — while most
// of the repo-lane catalog has no human owner at all, because it was built by
// platform-dispatched agents against issues nobody signed.
//
// This module is the one place that difference is resolved. Everything downstream —
// which queue a proposal lands in, who may accept it, whether a decline owes a statement
// of reasons — reads the answer from here rather than working it out again, so there is
// one routing rule for the whole feature instead of one per surface.
//
// A note on why this is not simply `creatorOwnsSlug`: that function answers "is this
// person the owner", which is the question the agent-key path has. This one answers "who
// is the owner", including the answer `platform`, which is the majority of the catalog
// and the case the proposal queue exists to serve.

import { creatorOwnsSlug } from '../platform/slug-ownership.js';
import { BOT_UID_PREFIX, DELETED_ACCOUNT_UID, type Store } from '../platform/store.js';

/**
 * Who reviews changes to a game.
 *
 * `platform` covers three distinct populations that all want the same handling: repo-lane
 * catalog games with no submission at all, games whose owning account was erased (their
 * jobs are reassigned to the deleted-account uid), and store-lane games built under a
 * `bot:` uid. None of them has a person to ask, so all of them route to the ops queue.
 */
export type OwnerOfRecord =
  { kind: 'creator'; uid: string } | { kind: 'platform'; reason: 'no_owner' | 'bot_owned' | 'owner_deleted' };

/**
 * Resolve who reviews proposals for `slug`.
 *
 * The lookup is by slug rather than by paging anybody's shelf, and it deliberately reuses
 * the same "newest non-abandoned submission" rule that decides editing authority
 * everywhere else. Two authorities disagreeing about who owns a game is precisely the bug
 * that would let a proposal be accepted by someone who cannot publish it.
 */
export async function resolveOwnerOfRecord(store: Store, slug: string): Promise<OwnerOfRecord> {
  const records = await store.listSubmissionsBySlug(slug);
  const newestLive = records.find((record) => !record.abandonedAt);
  if (!newestLive) {
    // No job at all, or every job abandoned: a repo-lane catalog game, or a store game
    // whose rounds were all walked away from. Either way nobody is waiting to be asked.
    return { kind: 'platform', reason: 'no_owner' };
  }
  if (newestLive.ownerUid === DELETED_ACCOUNT_UID) {
    return { kind: 'platform', reason: 'owner_deleted' };
  }
  if (newestLive.ownerUid.startsWith(BOT_UID_PREFIX)) {
    return { kind: 'platform', reason: 'bot_owned' };
  }
  return { kind: 'creator', uid: newestLive.ownerUid };
}

/** The uid a proposal's `targetOwnerUid` is denormalised to. `null` means platform. */
export function ownerUidOf(owner: OwnerOfRecord): string | null {
  return owner.kind === 'creator' ? owner.uid : null;
}

/** Which kind of reviewer this is, for the statement-of-reasons rule. */
export function reviewerKindOf(owner: OwnerOfRecord): 'platform' | 'creator' {
  return owner.kind;
}

/**
 * Whether `uid` may review proposals against `slug`.
 *
 * Admins are handled by the caller, not here: an operator's authority comes from the
 * admin session, and folding it in would make this function answer two questions with
 * one boolean — which is how a non-admin creator ends up able to decide a platform
 * proposal because the check was reused somewhere it did not belong.
 */
export async function canReviewSlug(store: Store, slug: string, uid: string): Promise<boolean> {
  return creatorOwnsSlug(store, slug, uid);
}
