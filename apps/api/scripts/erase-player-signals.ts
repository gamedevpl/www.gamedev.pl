// Erase a person's player-side contributions — votes and written feedback.
//
//   npm run player:erase -w @gamedevpl/api -- g:12345 --dry-run
//   npm run player:erase -w @gamedevpl/api -- g:12345 --confirm
//
// This is the executable half of the promise in the privacy notice (§8, "Deleting your
// account"): account deletion removes the votes and feedback a person left on games.
// Deletion is requested by email, so this is an operator command rather than an HTTP
// route — a destructive, uid-targeted endpoint is attack surface that buys nothing when
// the request already arrives out of band and a human has to verify it anyway.
//
// Talks to Firestore with your ambient gcloud credentials, like `beta:approve` and
// `token:mint`. There is no dev/prod switch — check `gcloud config get-value project`
// before running against the live site.
//
// Note what this does *not* do: play telemetry is untouched because it carries no uid at
// all. There is nothing there to erase, which is the intended property, not a gap.

import { erasePlayerSignals, indexHint } from '../src/erase-player-signals.js';
import { FirestoreStore } from '../src/store.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  player:erase -- <uid> --dry-run    # show what would be removed',
      '  player:erase -- <uid> --confirm    # actually remove it',
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
  const result = await erasePlayerSignals({ store, uid, dryRun });

  const verb = result.dryRun ? 'would remove' : 'removed';
  console.log(`${result.dryRun ? '[dry run] ' : ''}${verb} for ${result.uid}:`);
  console.log(
    `  votes:    ${result.votesCleared.length}${result.votesCleared.length ? ` (${result.votesCleared.join(', ')})` : ''}`,
  );
  console.log(`  feedback: ${result.feedbackDeleted}`);
  if (result.votesCleared.length === 0 && result.feedbackDeleted === 0) {
    console.log('  nothing found — this account left no votes or feedback.');
  }
  console.log('  play telemetry: not applicable (carries no uid by design).');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);

  const hint = indexHint(message);
  // Safe to state as fact: the feedback query is the only step needing an index and it
  // runs before any vote is cleared, so an index failure happens before the first write.
  // `erasePlayerSignals` has a test pinning that order for exactly this claim.
  if (hint) console.error(`\n${hint}\nNothing was erased — this failed before the first write.`);

  process.exit(1);
});
