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
 *
 * The walk looks like something a collection-group query should replace, and it cannot be:
 * `collectionGroup('votes').where(FieldPath.documentId(), '==', uid)` throws, because a
 * documentId comparison on a collection group requires a *full document path*, and a bare
 * uid is a single segment. The path it wants is `games/{slug}/votes/{uid}` — which means
 * knowing the slug, which is the thing the query was supposed to find. Verified against
 * @google-cloud/firestore 8.7.0; the check is client-side, so it fails every time, not
 * just against a real database.
 */

/**
 * Turns Firestore's index errors into the action that resolves them.
 *
 * They are accurate but arrive as a wall of gRPC text ending in a console URL, at the exact
 * moment an operator is part-way through a deletion request they have already accepted.
 *
 * The distinction is the point: two different causes wear the same `9 FAILED_PRECONDITION`,
 * and the remedies are not interchangeable. Re-running `setup-gcp.sh` against a
 * still-building index reports it as already present, which reads as "the fix did not
 * work" and invites the operator to conclude the tool is broken.
 *
 * Returns null for anything else — an unrecognised failure should be shown as-is, not
 * dressed up as an index problem. That includes an index error naming some *other* query:
 * this command depends on exactly one index, so a hint is only honest when the message
 * says so. Confidently misidentifying the failure is worse than staying quiet, because a
 * raw error sends an operator to read it while a wrong hint sends them somewhere useless.
 */
export function indexHint(message: string): string | null {
  const isIndexFailure = message.includes('FAILED_PRECONDITION') && message.includes('index');
  const namesOurIndex = message.includes('playerFeedback') && message.includes('uid');
  if (!isIndexFailure || !namesOurIndex) return null;
  return message.includes('not ready yet')
    ? 'The index exists and is still building. Wait a minute and run this again — re-running\n' +
        'infra/setup-gcp.sh will not help; it will report the index as already present.'
    : 'The playerFeedback.uid collection-group index is missing. Run infra/setup-gcp.sh\n' +
        '(step 7), wait for the build to finish, then run this again.';
}

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

  // Feedback goes first, and the order is load-bearing rather than incidental.
  //
  // It is the only step that needs a Firestore index, so it is the only step that can fail
  // for a reason unrelated to the data — a missing or still-building index throws
  // 9 FAILED_PRECONDITION. The vote walk needs no index at all: `listDocuments`, document
  // reads, and single-document transactions. Running feedback first therefore means an
  // index failure happens before anything has been written, so the CLI can tell an operator
  // "nothing was erased" and have that be true. With the walk first, a failure here would
  // have cleared every vote and then reported that nothing happened.
  //
  // Count and delete run the same `where('uid','==',uid)` predicate over the same
  // collection group, differing only in `.count()` versus `.get()`. That matters more than
  // it looks: a dry run is the only thing standing between an operator and an irreversible
  // delete, so it must not be able to see a different set of rows than the delete will.
  const feedbackDeleted = dryRun
    ? await store.countPlayerFeedbackByUid(uid)
    : await store.deletePlayerFeedbackByUid(uid);

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

  return { uid, votesCleared, feedbackDeleted, dryRun };
}
