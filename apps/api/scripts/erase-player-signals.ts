// Erase an account completely — identity, credentials, subscriptions, and player data.
//
//   npm run player:erase -w @gamedevpl/api -- g:12345 --dry-run
//   ADMIN_UIDS=g:operator npm run player:erase -w @gamedevpl/api -- g:12345 --confirm
//
// This is the executable half of the promise in the privacy notice (§8, "Deleting your
// account"): account deletion removes the votes and feedback a person left on games.
// Self-service deletion normally waits through the recovery window and is purged by the
// scheduled sweep. This command remains for verified exceptional requests and dry-run
// inspection.
//
// Talks to Firestore with your ambient gcloud credentials, like `beta:approve` and
// `token:mint`. There is no dev/prod switch — check `gcloud config get-value project`
// before running against the live site.
//
// Note what this does *not* do: play telemetry is untouched because it carries no uid at
// all. There is nothing there to erase, which is the intended property, not a gap.

import { eraseAccount } from '../src/platform/erase-account.js';
import { scheduleAccountDeletion } from '../src/platform/account-deletion.js';
import { indexHint } from '../src/platform/erase-player-signals.js';
import { FirestoreStore } from '../src/platform/store.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  player:erase -- <uid> --dry-run    # show what would be removed',
      '  player:erase -- <uid> --confirm    # schedule removal after the recovery window',
      '',
      'One of --dry-run or --confirm is required.',
    ].join('\n'),
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const uid = args.find((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');

  // Neither flag, or both, is ambiguous about intent — and the destructive reading is
  // the one you do not want to guess at.
  if (!uid || dryRun === confirm) usage();

  const store = new FirestoreStore();
  const adminUids = new Set(
    (process.env.ADMIN_UIDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (confirm && adminUids.size === 0) {
    throw new Error('ADMIN_UIDS must be set before scheduling deletion so operator protection can be enforced');
  }
  const account = await eraseAccount({ store, uid, dryRun: true, adminUids });
  const result = account.signals;

  if (confirm) {
    const scheduled = await scheduleAccountDeletion({ store, uid, adminUids });
    if (!scheduled) throw new Error('account not found');
    console.log(`scheduled deletion for ${uid} after ${scheduled.scheduledFor}; cleanup will remove:`);
  } else {
    console.log(`[dry run] would schedule deletion for ${result.uid}; cleanup would remove:`);
  }
  console.log(
    `  votes:    ${result.votesCleared.length}${result.votesCleared.length ? ` (${result.votesCleared.join(', ')})` : ''}`,
  );
  console.log(`  feedback: ${result.feedbackDeleted}`);
  console.log(
    `  saves:    ${result.savesDeleted.length}${result.savesDeleted.length ? ` (${result.savesDeleted.join(', ')})` : ''}`,
  );
  console.log(
    `  affinity: ${result.affinityCleared.length}${result.affinityCleared.length ? ` (${result.affinityCleared.join(', ')})` : ''}`,
  );
  console.log(
    `  worlds:   ${result.worldsErased.length}${result.worldsErased.length ? ` (${result.worldsErased.join(', ')})` : ''}`,
  );
  console.log(
    `  handles:  ${result.handlesReleased.length}${result.handlesReleased.length ? ` (${result.handlesReleased.join(', ')})` : ''}`,
  );
  console.log(
    `  published games kept: ${account.identity.publishedSlugs.length}${account.identity.publishedSlugs.length ? ` (${account.identity.publishedSlugs.join(', ')})` : ''}`,
  );
  console.log(
    `  unpublished games removed: ${account.identity.unpublishedSlugs.length}${account.identity.unpublishedSlugs.length ? ` (${account.identity.unpublishedSlugs.join(', ')})` : ''}`,
  );
  if (
    result.votesCleared.length === 0 &&
    result.feedbackDeleted === 0 &&
    result.savesDeleted.length === 0 &&
    result.affinityCleared.length === 0 &&
    result.worldsErased.length === 0 &&
    result.handlesReleased.length === 0
  ) {
    console.log(
      '  nothing found — this account left no votes, feedback, saved progress, play affinity, world entries, or creator handles.',
    );
  }
  if (result.worldsErased.length > 0) {
    // Worth saying out loud: unlike the rest of this report, these removals change
    // what other players see the next time they open the game.
    console.log('  note: world entries were visible to other players; removing them changes those games.');
  }
  console.log('  play telemetry: not applicable (carries no uid by design).');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);

  const hint = indexHint(message);
  // Safe to state as fact: both steps needing an index — the world listing and the
  // feedback query — run before anything is written, so an index failure happens before
  // the first write. `erasePlayerSignals` has a test per index pinning that order for
  // exactly this claim.
  if (hint) console.error(`\n${hint}\nNothing was erased — this failed before the first write.`);

  process.exit(1);
});
