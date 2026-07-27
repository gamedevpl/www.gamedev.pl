import type { Store } from './store.js';

/**
 * Erase everything a person contributed *as a player*: their votes and their written
 * feedback.
 *
 * This exists because the privacy notice promises it. Section 8 says account deletion
 * removes "the votes and written feedback you left on games", and until now that was a
 * promise nothing could execute — an operator would have had to find the rows by hand in
 * the Firestore console, across every game, knowing that a vote is keyed by document id.
 * A commitment that depends on somebody remembering how the schema works is one that
 * quietly stops being true.
 *
 * **Play telemetry is deliberately not touched, and that is not an omission.** Play
 * events carry no uid, no IP and no user agent by construction, so there is nothing in
 * them to erase and nothing that could be found even if we tried. That is the whole point
 * of the "measures games, not people" invariant: the erase path for play data is that it
 * was never attributed in the first place.
 *
 * Two shapes of deletion, because the two collections are keyed differently:
 *
 * - **Feedback** carries `uid` as a field, so one collection-group query finds every row
 *   a person wrote, across all games.
 * - **A vote's uid is its document id**, with no field to query on. So votes are found by
 *   walking the games and clearing each one — and cleared through `clearVote` rather than
 *   deleted directly, because the aggregate counts live on the parent game document and a
 *   raw delete would leave `votesUp`/`votesDown` overstating reality forever.
 */

export interface ErasePlayerSignalsResult {
  uid: string;
  /** Games where a vote was found (and cleared, unless this was a dry run). */
  votesCleared: string[];
  /** Feedback rows found (and deleted, unless this was a dry run). */
  feedbackDeleted: number;
  dryRun: boolean;
}

export interface ErasePlayerSignalsOptions {
  store: Store;
  uid: string;
  /** Report what would go without touching anything. */
  dryRun?: boolean;
}

export async function erasePlayerSignals(options: ErasePlayerSignalsOptions): Promise<ErasePlayerSignalsResult> {
  const { store, uid } = options;
  const dryRun = options.dryRun ?? false;

  const slugs = await store.listGameSlugs();
  const votesCleared: string[] = [];
  for (const slug of slugs) {
    const vote = await store.getVote(slug, uid);
    if (vote === null) continue;
    votesCleared.push(slug);
    // `clearVote` is transactional and fixes the parent game's tallies; deleting the
    // vote document directly would strand the counts.
    if (!dryRun) await store.clearVote(slug, uid);
  }

  const feedbackDeleted = dryRun
    ? await countFeedbackFor(store, uid, slugs)
    : await store.deletePlayerFeedbackByUid(uid);

  return { uid, votesCleared, feedbackDeleted, dryRun };
}

/**
 * Counts a user's feedback without deleting it — the dry-run path only.
 *
 * Walks the games rather than adding a count-by-uid to the Store interface: this runs
 * once per erase request, by an operator, and a second query shape that exists solely to
 * preview a delete is a second thing that can disagree with the delete it previews.
 */
async function countFeedbackFor(store: Store, uid: string, slugs: string[]): Promise<number> {
  let total = 0;
  for (const slug of slugs) {
    const rows = await store.listPlayerFeedback(slug);
    total += rows.filter((row) => row.uid === uid).length;
  }
  return total;
}
