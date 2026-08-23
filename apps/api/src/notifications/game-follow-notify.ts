import { emitFollowedGameNotification, type EmitDeps } from './notify.js';
import type { Store } from '../platform/store.js';

/**
 * Fans a published version out to the game's followers.
 *
 * Kept beside the publish route rather than inside it because it is courtesy work with
 * a different failure posture: publishing must be atomic and loud, this must be neither.
 * Every property below exists to keep one operator click from becoming a write storm or
 * a duplicate inbox:
 *
 *  - **The owner is skipped.** They already receive `submission.published` from the
 *    notification sweep; a second note for their own game is noise they cannot turn off.
 *  - **Bounded.** A cap on recipients, and a cap on how many go out at once. A game
 *    with more followers than the cap is a good problem, and the right response to it
 *    is a queue rather than a burst — until then the cap is honest about what shipped.
 *  - **Best-effort per follower.** One failed write must not cost the rest theirs, so
 *    failures are counted and logged, never thrown.
 */

/** How many followers one publish will notify. */
export const MAX_FOLLOWER_FANOUT = 500;

/** How many notification writes run at once. */
export const FOLLOWER_FANOUT_CONCURRENCY = 8;

export interface FollowerFanoutEvent {
  slug: string;
  version: string;
  gameTitle: string;
  ownerUid: string;
}

export interface FollowerFanoutOptions {
  store: Store;
  emitDeps: EmitDeps;
  log?: { error: (context: object, message: string) => void };
  maxFanout?: number;
  concurrency?: number;
}

export function createFollowerFanout(
  options: FollowerFanoutOptions,
): (event: FollowerFanoutEvent) => Promise<{ notified: number; failed: number; truncated: boolean }> {
  const maxFanout = options.maxFanout ?? MAX_FOLLOWER_FANOUT;
  const concurrency = Math.max(1, options.concurrency ?? FOLLOWER_FANOUT_CONCURRENCY);

  return async function notifyFollowers(event) {
    // Two over the cap, not one. The cap counts *recipients*, and the owner is dropped
    // below — they can occupy at most one slot, so reading one extra beyond that is
    // what makes "there were more than we notified" distinguishable from "there were
    // exactly the cap". Deciding `truncated` before the owner is removed reports a
    // truncation that never happened whenever the owner is the row past the cap.
    const followers = await options.store.listGameFollowers(event.slug, { limit: maxFanout + 2 });
    const candidates = followers.filter((uid) => uid !== event.ownerUid);
    const truncated = candidates.length > maxFanout;
    const recipients = candidates.slice(0, maxFanout);

    let notified = 0;
    let failed = 0;
    for (let index = 0; index < recipients.length; index += concurrency) {
      const batch = recipients.slice(index, index + concurrency);
      // Each task reports its own outcome and the batch is tallied after it settles.
      // The previous shape incremented shared counters inside the mapper; that was in
      // fact safe (a `+= 1` carries no await, so the event loop cannot interleave it),
      // but "is this a race?" is a question the reader should not have to answer.
      const outcomes = await Promise.all(
        batch.map(async (uid): Promise<'created' | 'duplicate' | 'failed'> => {
          try {
            const { created } = await emitFollowedGameNotification(options.emitDeps, {
              uid,
              slug: event.slug,
              gameTitle: event.gameTitle,
              version: event.version,
              link: `/play/${event.slug}`,
            });
            return created ? 'created' : 'duplicate';
          } catch (error) {
            options.log?.error({ err: error, slug: event.slug, uid }, 'could not notify a follower of a new version');
            return 'failed';
          }
        }),
      );
      for (const outcome of outcomes) {
        if (outcome === 'created') notified += 1;
        else if (outcome === 'failed') failed += 1;
      }
    }

    if (truncated) {
      options.log?.error(
        { slug: event.slug, cap: maxFanout },
        'follower fan-out hit its cap; some followers were not notified',
      );
    }
    return { notified, failed, truncated };
  };
}
