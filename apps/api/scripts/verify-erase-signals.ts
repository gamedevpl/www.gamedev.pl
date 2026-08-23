// Prove that `player:erase` still finds and removes real rows in a real database.
//
//   npm run verify:erase -w @gamedevpl/api
//
// `player:erase --dry-run` reporting zeroes cannot tell "this person left nothing" apart
// from "the collection-group query stopped matching months ago". This plants fixtures,
// runs the erase path over them, checks the database after every step, and cleans up.
//
// Talks to Firestore with your ambient gcloud credentials, like `player:erase` itself,
// and there is no dev/prod switch — check `gcloud config get-value project` first. It
// writes: synthetic rows under a `verify:` uid and a game slug no game holds, removed
// again before it exits. It has no uid argument and cannot be aimed at an account.
//
// Exits non-zero when a check fails or a fixture survives, so a scheduled run is a
// standing proof of the §8 promise rather than something an operator must remember.

import { randomBytes } from 'node:crypto';
import { indexHint } from '../src/platform/erase-player-signals.js';
import { FirestoreStore } from '../src/platform/store.js';
import { mintVerificationUid, verifyEraseSignals } from '../src/platform/verify-erase-signals.js';

async function main(): Promise<void> {
  const uid = mintVerificationUid(randomBytes(4).toString('hex'));
  console.log(`verifying erasure with fixtures under ${uid}`);

  const result = await verifyEraseSignals({ store: new FirestoreStore(), uid });

  for (const step of result.steps) {
    console.log(`  ${step.ok ? 'ok  ' : 'FAIL'} ${step.name} — ${step.detail}`);
  }

  // Printed on a pass too. A green run attests to three of the four signals, and an
  // operator quoting it at somebody who asked about their votes should not have to have
  // read the source to know that.
  console.log('  note: votes are not covered — planting one would write a real game document.');

  if (result.residue.length > 0) {
    console.error('\nfixtures left behind — remove these by hand:');
    for (const item of result.residue) console.error(`  - ${item}`);
    console.error(`\nTry: npm run player:erase -w @gamedevpl/api -- ${uid} --confirm`);
  }

  if (!result.ok || result.residue.length > 0) {
    console.error('\nFAIL — erasure did not behave as reported. Do not answer a deletion request until this passes.');
    process.exit(1);
  }
  console.log('\nPASS — erasure found every fixture, removed nothing on the dry run, and left nothing behind.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);

  // Same two indexes as `player:erase`, for the same reason: this command's first act is
  // a collection-group read, so a missing index fails it before anything is planted.
  const hint = indexHint(message);
  if (hint) console.error(`\n${hint}`);

  process.exit(1);
});
