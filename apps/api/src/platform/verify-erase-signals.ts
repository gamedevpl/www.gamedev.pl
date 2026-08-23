import { erasePlayerSignals } from './erase-player-signals.js';
import type { Store } from './store.js';
import { MAX_WORLD_ENTRIES } from '../realtime/world-schema.js';

/**
 * Proves `erasePlayerSignals` still finds and removes real rows in a real database.
 *
 * The privacy notice's §8 promise is only as good as the code that executes it, and that
 * code's failure mode is silent. `player:erase --dry-run` answering `worlds: 0` looks
 * identical whether the collection-group query works and the person left nothing, or the
 * index was renamed six months ago and the query has matched nothing since. The same
 * ambiguity applies to `feedback: 0`. A count of zero is only evidence when something
 * would have made it non-zero.
 *
 * So this plants rows a real player's would be indistinguishable from, runs the erase
 * path over them, and checks at each step that what happened is what was reported:
 * the dry run finds them and removes nothing, the confirmed run removes them, and a
 * second dry run reports zero. Every assertion is against the database, not against the
 * command's own summary — a command that miscounts its own work is one of the things
 * this exists to catch.
 *
 * **It cannot be pointed at a person.** There is no uid parameter to get wrong: the uid
 * is minted here, in the `verify:` namespace that no sign-in path can produce, and every
 * entry point re-checks it. That is deliberate — the useful version of this command is
 * one an operator can run on a Friday without reading the source first, and any design
 * where a mistyped argument erases somebody's account is not that.
 *
 * ## Why presence is not covered
 *
 * Because there is nothing to cover. P2.5 presence is TTL-only and lives in the API
 * process's memory (`presence.ts`), so it never becomes a row `erasePlayerSignals` could
 * find or miss. That is the point of the posture rather than a gap in this command: the
 * signal with no durable form is the one whose erasure cannot silently stop working. If
 * presence ever grows a stored half, it joins the erase path and this file in the same
 * commit.
 *
 * ## Why votes are not covered
 *
 * Three of the four signals can be planted as leaf documents whose parents never have to
 * exist: feedback under `games/{slug}/playerFeedback`, saves under
 * `users/{uid}/gameSaves`, play affinity under `users/{uid}/playAffinity`, world entries
 * under `worlds/{worldId}/worldEntries`. Firestore
 * is content to hold a subcollection under a document that was never written, and once
 * the leaves are deleted the ghost parent stops being listed. Nothing survives the run.
 *
 * A vote cannot work that way, because a vote's aggregate lives on the game document:
 * both `castVote` and `clearVote` write `games/{slug}` to keep `votesUp`/`votesDown`
 * honest. Planting one therefore either perturbs a real game's public tally — for as long
 * as the run takes, and permanently if it dies in between — or leaves a synthetic game
 * document sitting in the `games` collection, which `listGameSlugs` would then hand to
 * every future erase run. Neither is worth it, and the vote walk is the path that needs
 * it least: it uses no query and no index, so it has no way to fail quietly the way an
 * index-backed read does. It is the one thing a passing run here does not attest to, so
 * the result says so out loud rather than letting a green check imply otherwise.
 */

/**
 * A namespace no human account can occupy. Sign-in mints `g:` (Google) and `dev:`;
 * `bot:` is minted for automation by an admin. Nothing anywhere produces `verify:`, so a
 * uid in it cannot collide with a person even by accident.
 */
const VERIFY_UID_PREFIX = 'verify:';

/**
 * Fixtures live under ids that no published game can hold, so nothing planted here is
 * ever visible to a player.
 *
 * A world id equals a game slug (`worldIdFor`), and this one belongs to no game, so the
 * world route would 404 on it long before anybody could read an entry. The index and the
 * collection-group query are indifferent to which world a row sits in — `worldEntries` is
 * one group across all of them — so a synthetic world exercises exactly the same read
 * path as a real one. What it deliberately does not test is that some *particular*
 * published game's world is wired up correctly; that is the game's write path, and it
 * belongs to that game's tests rather than to a periodic proof of the erase path.
 */
export const VERIFICATION_WORLD_ID = 'erase-verification';
export const VERIFICATION_SLUG = 'erase-verification';
const VERIFICATION_WORLD_KEY = 'fixture';

export function isVerificationUid(uid: string): boolean {
  return uid.startsWith(VERIFY_UID_PREFIX) && uid.length > VERIFY_UID_PREFIX.length;
}

/**
 * Minted per run rather than fixed, so two operators running this at once cannot delete
 * each other's fixtures and read the resulting emptiness as a passing erase.
 */
export function mintVerificationUid(suffix: string): string {
  return `${VERIFY_UID_PREFIX}erase-${suffix}`;
}

export interface VerifyEraseStep {
  name: string;
  ok: boolean;
  /** What was expected and what the database actually held, for a failure to be readable. */
  detail: string;
}

export interface VerifyEraseResult {
  uid: string;
  steps: VerifyEraseStep[];
  ok: boolean;
  /**
   * Fixtures that outlived the run, described for a human to remove.
   *
   * Non-empty is its own kind of failure and never folded into `ok`'s reasons: a
   * verification that leaves rows behind has to say so even when every assertion passed,
   * because somebody has to go clean up.
   */
  residue: string[];
  /** Always false today — votes are out of scope; see the note above. */
  votesCovered: boolean;
}

const FIXTURE_FEEDBACK_TEXT = 'erase verification fixture, safe to delete';
const FIXTURE_SAVE_DATA = '{"eraseVerification":true}';
const FIXTURE_WORLD_FIELDS = { marker: 'erase-verification' };

type FixtureKind = 'world entry' | 'feedback' | 'save' | 'affinity';

interface PlantedState {
  worldEntry: boolean;
  feedback: number;
  save: boolean;
  affinity: boolean;
}

async function observe(store: Store, uid: string): Promise<PlantedState> {
  const [entry, feedback, saves, affinity] = await Promise.all([
    store.getWorldEntry(VERIFICATION_WORLD_ID, VERIFICATION_WORLD_KEY),
    store.countPlayerFeedbackByUid(uid),
    store.listGameSaves(uid),
    store.listPlayAffinity(uid),
  ]);
  return {
    // Ownership matters, not just existence: a leftover row from another run under the
    // same key would otherwise read as this run's fixture surviving its own erase.
    worldEntry: entry !== null && entry.ownerUid === uid,
    feedback,
    save: saves.some((save) => save.slug === VERIFICATION_SLUG),
    affinity: affinity.some((row) => row.slug === VERIFICATION_SLUG),
  };
}

function describe(state: PlantedState): string {
  return `world entry ${state.worldEntry ? 'present' : 'absent'}, feedback ${state.feedback}, save ${
    state.save ? 'present' : 'absent'
  }, affinity ${state.affinity ? 'present' : 'absent'}`;
}

function isFullyPlanted(state: PlantedState): boolean {
  return state.worldEntry && state.feedback === 1 && state.save && state.affinity;
}

function isFullyGone(state: PlantedState): boolean {
  return !state.worldEntry && state.feedback === 0 && !state.save && !state.affinity;
}

export interface VerifyEraseOptions {
  store: Store;
  /** Must be in the `verify:` namespace; mint it with `mintVerificationUid`. */
  uid: string;
}

export async function verifyEraseSignals(options: VerifyEraseOptions): Promise<VerifyEraseResult> {
  const { store, uid } = options;
  // Thrown rather than reported, and before a single write: a caller that got this wrong
  // is not asking a question whose answer is a failed step, it is about to plant rows
  // under somebody's real account and then erase everything that account owns.
  if (!isVerificationUid(uid)) {
    throw new Error(
      `refusing to run against "${uid}": verification fixtures may only be planted under a ${VERIFY_UID_PREFIX} uid`,
    );
  }

  const steps: VerifyEraseStep[] = [];
  const record = (name: string, ok: boolean, detail: string): boolean => {
    steps.push({ name, ok, detail });
    return ok;
  };
  // What actually landed, so cleanup can distinguish "nothing to remove" from "removal
  // failed". A run that dies on its first call — unreachable database, no credentials —
  // has planted nothing, and telling the operator to go clear residue at that moment
  // sends them looking for rows that do not exist.
  const planted = new Set<FixtureKind>();

  try {
    await plantFixtures(store, uid, planted);

    const state = await observe(store, uid);
    if (!record('fixtures planted', isFullyPlanted(state), describe(state))) {
      return finish(store, uid, steps, planted);
    }

    const preview = await erasePlayerSignals({ store, uid, dryRun: true });
    const previewFound =
      preview.worldsErased.join(',') === VERIFICATION_WORLD_ID &&
      preview.feedbackDeleted === 1 &&
      preview.savesDeleted.join(',') === VERIFICATION_SLUG &&
      preview.affinityCleared.join(',') === VERIFICATION_SLUG;
    record(
      'dry run finds every fixture',
      previewFound,
      `worlds [${preview.worldsErased.join(', ')}], feedback ${preview.feedbackDeleted}, saves [${preview.savesDeleted.join(', ')}], affinity [${preview.affinityCleared.join(', ')}]`,
    );

    // The check the whole dry-run affordance rests on. An operator reads a preview and
    // then decides; a preview that quietly deletes has already made the decision.
    const afterPreview = await observe(store, uid);
    record('dry run removed nothing', isFullyPlanted(afterPreview), describe(afterPreview));

    const erased = await erasePlayerSignals({ store, uid, dryRun: false });
    const erasedSame =
      erased.worldsErased.join(',') === preview.worldsErased.join(',') &&
      erased.feedbackDeleted === preview.feedbackDeleted &&
      erased.savesDeleted.join(',') === preview.savesDeleted.join(',') &&
      erased.affinityCleared.join(',') === preview.affinityCleared.join(',');
    record(
      'confirmed run reports what the dry run promised',
      erasedSame,
      `worlds [${erased.worldsErased.join(', ')}], feedback ${erased.feedbackDeleted}, saves [${erased.savesDeleted.join(', ')}], affinity [${erased.affinityCleared.join(', ')}]`,
    );

    // Against the database rather than the command's own report, because "said it deleted
    // three things" and "deleted three things" are exactly what can come apart.
    const afterErase = await observe(store, uid);
    record('fixtures are gone from the database', isFullyGone(afterErase), describe(afterErase));

    const rerun = await erasePlayerSignals({ store, uid, dryRun: true });
    const idempotent =
      rerun.worldsErased.length === 0 &&
      rerun.feedbackDeleted === 0 &&
      rerun.savesDeleted.length === 0 &&
      rerun.affinityCleared.length === 0;
    record(
      'second dry run reports nothing left',
      idempotent,
      `worlds [${rerun.worldsErased.join(', ')}], feedback ${rerun.feedbackDeleted}, saves [${rerun.savesDeleted.join(', ')}], affinity [${rerun.affinityCleared.join(', ')}]`,
    );
  } catch (error) {
    record('run completed', false, error instanceof Error ? error.message : String(error));
  }

  return finish(store, uid, steps, planted);
}

async function plantFixtures(store: Store, uid: string, planted: Set<FixtureKind>): Promise<void> {
  // Through the same store calls the HTTP write paths use, so a fixture is a row of the
  // shape the erase path will actually meet in the wild rather than an approximation of
  // one built to be findable.
  const result = await store.putWorldEntry({
    worldId: VERIFICATION_WORLD_ID,
    key: VERIFICATION_WORLD_KEY,
    uid,
    fields: FIXTURE_WORLD_FIELDS,
    maxPerPlayer: 1,
    maxEntries: MAX_WORLD_ENTRIES,
  });
  if (!result.ok) throw new Error(`could not plant world entry: ${result.reason}`);
  planted.add('world entry');

  await store.addPlayerFeedback(VERIFICATION_SLUG, uid, FIXTURE_FEEDBACK_TEXT);
  planted.add('feedback');
  await store.putGameSave(uid, VERIFICATION_SLUG, FIXTURE_SAVE_DATA, 1);
  planted.add('save');
  await store.recordPlayAffinity(uid, VERIFICATION_SLUG);
  planted.add('affinity');
}

/**
 * Removes anything still standing and reports what could not be removed.
 *
 * Runs after a pass as much as after a failure: on a pass it should find nothing, and
 * "should" is the word this exists to replace. Each removal is attempted independently,
 * because the likeliest reason cleanup is needed at all is that one of these very methods
 * is broken — and one broken method must not strand the fixtures the others could take.
 */
async function finish(
  store: Store,
  uid: string,
  steps: VerifyEraseStep[],
  planted: Set<FixtureKind>,
): Promise<VerifyEraseResult> {
  const residue: string[] = [];
  // Nothing was ever written, so there is nothing to remove and nothing to confirm.
  // Reaching for the database again here would only turn one honest error into three.
  if (planted.size === 0) return summarize(uid, steps, residue);

  for (const [what, remove] of [
    ['world entry', () => store.deleteWorldEntriesForUser(uid)],
    ['feedback', () => store.deletePlayerFeedbackByUid(uid)],
    ['save', () => store.deleteGameSaves(uid)],
    ['affinity', () => store.deletePlayAffinity(uid)],
  ] as const) {
    if (!planted.has(what)) continue;
    try {
      await remove();
    } catch (error) {
      residue.push(`${what}: cleanup failed (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  try {
    const left = await observe(store, uid);
    if (left.worldEntry) residue.push(`world entry ${VERIFICATION_WORLD_ID}/${VERIFICATION_WORLD_KEY}`);
    if (left.feedback > 0) residue.push(`${left.feedback} feedback row(s) under ${VERIFICATION_SLUG}`);
    if (left.save) residue.push(`game save ${VERIFICATION_SLUG}`);
    if (left.affinity) residue.push(`play affinity ${VERIFICATION_SLUG}`);
  } catch (error) {
    residue.push(`could not confirm cleanup: ${error instanceof Error ? error.message : String(error)}`);
  }

  return summarize(uid, steps, residue);
}

function summarize(uid: string, steps: VerifyEraseStep[], residue: string[]): VerifyEraseResult {
  return {
    uid,
    steps,
    ok: steps.length > 0 && steps.every((step) => step.ok),
    residue,
    votesCovered: false,
  };
}
