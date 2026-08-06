import type { Store } from './store.js';

/**
 * Erase everything a person contributed *as a player*: their votes, their written
 * feedback, their saved game progress, and the play-affinity rows that personalise
 * the home-page recommendations rail.
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
 * was never attributed in the first place. Play *affinity* (the signed-in open history
 * used for recommendations) is different — it lives under the user and is erased here.
 *
 * Two shapes of deletion, because the two collections are keyed differently:
 *
 * - **Feedback** carries `uid` as a field, so one collection-group query finds every row
 *   a person wrote, across all games.
 * - **A vote's uid is its document id**, with no field to query on. So votes are found by
 *   walking the games and clearing each one — and cleared through `clearVote` rather than
 *   deleted directly, because the aggregate counts live on the parent game document and a
 *   raw delete would leave `votesUp`/`votesDown` overstating reality forever.
 * - **Saves and play affinity live under the player** (`users/{uid}/gameSaves/{slug}` and
 *   `users/{uid}/playAffinity/{slug}`), so erasing them is one subcollection delete with
 *   no query, no index, and no walk. That is the vote layout's lesson applied rather than
 *   repeated — the schema was chosen so this function would stay cheap as the catalog grows.
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
 * Two indexes carry this command — `playerFeedback.uid` and, since P2 added the world
 * listing, `worldEntries.ownerUid` — so the hint has to name which of them failed. Sending
 * an operator to check the wrong collection costs them the debugging session.
 *
 * Returns null for anything else — an unrecognised failure should be shown as-is, not
 * dressed up as an index problem. That includes an index error naming a collection this
 * command never queries: it belongs to some other caller, and answering it with "provision
 * playerFeedback.uid" points at something already fine. Confidently misidentifying the
 * failure is worse than staying quiet, because a raw error sends an operator to read it
 * while a wrong hint sends them somewhere useless.
 */
export function indexHint(message: string): string | null {
  const isIndexFailure = message.includes('FAILED_PRECONDITION') && message.includes('index');
  if (!isIndexFailure) return null;
  // Two collection-group indexes carry this command now — feedback since it was written,
  // and world entries since P2. Naming the one that actually failed matters: sending an
  // operator to check `playerFeedback` when `worldEntries` is the missing one costs them
  // the whole debugging session.
  const failed =
    message.includes('playerFeedback') && message.includes('uid')
      ? 'playerFeedback.uid'
      : message.includes('worldEntries') && message.includes('ownerUid')
        ? 'worldEntries.ownerUid'
        : null;
  if (!failed) return null;
  return message.includes('not ready yet')
    ? `The ${failed} index exists and is still building. Wait a minute and run this again —\n` +
        're-running infra/setup-gcp.sh will not help; it will report the index as already present.'
    : `The ${failed} collection-group index is missing. Run infra/setup-gcp.sh\n` +
        '(step 7), wait for the build to finish, then run this again.';
}

export interface ErasePlayerSignalsResult {
  uid: string;
  /** Games where a vote was found (and cleared, unless this was a dry run). */
  votesCleared: string[];
  /** Games this account followed (and unfollowed, unless this was a dry run). */
  followsCleared: string[];
  /** Feedback rows found (and deleted, unless this was a dry run). */
  feedbackDeleted: number;
  assessmentsDeleted: number;
  /** Games whose saved progress was found (and deleted, unless this was a dry run). */
  savesDeleted: string[];
  /** Editor drafts found under the account (and deleted, unless this was a dry run). */
  editorDraftsDeleted: number;
  /** Games recorded in play affinity (and deleted, unless this was a dry run). */
  affinityCleared: string[];
  /**
   * Shared worlds this person had built in (and was removed from, unless a dry run).
   *
   * Named separately from saves because the consequence is different and an operator
   * has to be able to say it out loud: erasing a save removes something only this
   * person could see, while erasing a world entry takes a thing off other players'
   * screens. It is still the right call — it is their contribution to withdraw.
   */
  worldsErased: string[];
  /** Creator-profile handle reservations freed (active and cooldown-held). */
  handlesReleased: string[];
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

  // Every step that needs a Firestore index runs before every step that writes, and that
  // order is load-bearing rather than incidental.
  //
  // An index-backed query is the only kind of step here that can fail for a reason
  // unrelated to the data — a missing or still-building index throws 9 FAILED_PRECONDITION.
  // The vote walk needs no index at all: `listDocuments`, document reads, and
  // single-document transactions. Doing the indexed reads first therefore means such a
  // failure happens before anything has been written, so the CLI can tell an operator
  // "nothing was erased" and have that be true.
  //
  // There are two of them now. Feedback has needed one since this was written; listing a
  // person's worlds has needed a second since P2 added `worldEntries.ownerUid`, and that
  // one was originally left down beside its delete — which quietly broke this guarantee,
  // because a missing world index would have wiped feedback, votes and saves first and
  // then thrown. Both are pinned by tests; if someone moves either below a write, they
  // fail.
  //
  // Count and delete run the same `where('uid','==',uid)` predicate over the same
  // collection group, differing only in `.count()` versus `.get()`. That matters more than
  // it looks: a dry run is the only thing standing between an operator and an irreversible
  // delete, so it must not be able to see a different set of rows than the delete will.
  // Listing worlds goes first because it is the one indexed step that is a *pure* read.
  // Feedback cannot take that position: on a real run its query and its delete are the
  // same call, so whichever indexed step runs first, feedback is already gone by the time
  // a later one could fail. Listing is also what lets the report name the worlds rather
  // than count them — "your plantings in these two games are gone" is the sentence an
  // operator has to be able to say back to the person who asked.
  const worldsErased = await store.listWorldsForUser(uid);

  const feedbackDeleted = dryRun
    ? await store.countPlayerFeedbackByUid(uid)
    : await store.deletePlayerFeedbackByUid(uid);

  // Erase reviewer assessments with the same promise as feedback.
  const assessmentsDeleted = dryRun
    ? await store.countGameAssessmentsByUid(uid)
    : await store.deleteGameAssessmentsByUid(uid);

  const slugs = await store.listGameSlugs();
  const votesCleared: string[] = [];
  const followsCleared: string[] = [];
  for (const slug of slugs) {
    const vote = await store.getVote(slug, uid);
    if (vote !== null) {
      votesCleared.push(slug);
      // `clearVote` is transactional and fixes the parent game's tallies; deleting the
      // vote document directly would strand the counts.
      if (!dryRun) await store.clearVote(slug, uid);
    }

    // Follows are keyed by uid as the document id, exactly like votes, so they are
    // findable only by walking the games — and they are personal data for the same
    // reason a vote is: they say which games this person cares about.
    if (await store.isFollowingGame(slug, uid)) {
      followsCleared.push(slug);
      if (!dryRun) await store.clearGameFollow(slug, uid);
    }
  }

  // Listed before deleting even on a real run, so the report names the games rather
  // than just counting them — "your progress in these five games is gone" is the
  // sentence an operator has to be able to say back to the person who asked.
  const savesDeleted = (await store.listGameSaves(uid)).map((save) => save.slug).sort();
  if (!dryRun && savesDeleted.length > 0) await store.deleteGameSaves(uid);

  // A creator's private editor drafts are personal data the same way saves are.
  // Counted the same way in both modes, so the preview an operator reads before
  // approving an erasure describes what the real run will remove; reporting zero
  // for a dry run made an editor-only account look empty.
  //
  // Deliberately not caught: an erasure that fails must fail loudly. Swallowing a
  // Firestore error here would tell the operator the account was cleared while
  // the creator's private content was still stored — the one outcome this path
  // exists to prevent.
  const draftSlugs = (await store.listEditorDrafts(uid)).map((draft) => draft.slug).sort();
  const editorDraftsDeleted = draftSlugs.length;
  if (!dryRun && editorDraftsDeleted > 0) await store.deleteEditorDrafts(uid);

  const affinityCleared = (await store.listPlayAffinity(uid)).map((entry) => entry.slug).sort();
  if (!dryRun && affinityCleared.length > 0) await store.deletePlayAffinity(uid);

  if (!dryRun && worldsErased.length > 0) await store.deleteWorldEntriesForUser(uid);

  // Public creator-profile identity is personal data shown by consent of claiming a
  // handle. The privacy notice promises the reservation clears with the account — without
  // this, deleting the user doc would leave handles/{handle} taken forever.
  let handlesReleased: string[];
  if (dryRun) {
    const user = await store.getUser(uid);
    handlesReleased = user?.handle ? [user.handle] : [];
  } else {
    handlesReleased = await store.releaseCreatorHandles(uid, new Date().toISOString());
  }

  return {
    uid,
    votesCleared,
    followsCleared,
    feedbackDeleted,
    assessmentsDeleted,
    savesDeleted,
    editorDraftsDeleted,
    affinityCleared,
    worldsErased,
    handlesReleased,
    dryRun,
  };
}
