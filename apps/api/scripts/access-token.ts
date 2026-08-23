// Personal access tokens from the command line (docs/agent-access-tokens.md).
//
//   npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "agent vm"
//   npm run token:mint   -w @gamedevpl/api -- bot:e2e --name "agent vm" --days 30
//   npm run token:list   -w @gamedevpl/api -- bot:e2e
//   npm run token:revoke -w @gamedevpl/api -- <tokenId>
//
// This is the operator path that needs no browser: it talks to Firestore directly with
// your ambient gcloud credentials, the same way `beta:approve` does. The HTTP route at
// /api/admin/access-tokens does the identical thing for anyone already signed in as an
// admin — both call `mintAccessTokenFor`, so the namespace rule, the per-account cap and
// the expiry default cannot drift between them.
//
// Writes to whatever project your credentials point at. There is no dev/prod switch here,
// so check `gcloud config get-value project` before minting against the live site.

import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  mintAccessTokenFor,
  MintAccessTokenError,
  toPublicAccessToken,
} from '../src/platform/access-token-service.js';
import { FirestoreStore } from '../src/platform/store.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  token:mint   -- <uid> --name <label> [--days N] [--dry-run]',
      '  token:list   -- <uid>',
      '  token:revoke -- <tokenId>',
    ].join('\n'),
  );
  process.exit(1);
}

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function mint(store: FirestoreStore, args: string[]): Promise<void> {
  const uid = args.find((arg) => !arg.startsWith('--'));
  const name = flagValue(args, '--name');
  const daysRaw = flagValue(args, '--days');
  if (!uid || !name) usage();

  const expiresInDays = daysRaw ? Number(daysRaw) : undefined;
  if (
    daysRaw &&
    (!Number.isInteger(expiresInDays) || (expiresInDays ?? 0) < 1 || (expiresInDays ?? 0) > MAX_EXPIRY_DAYS)
  ) {
    console.error(`--days must be an integer from 1 to ${MAX_EXPIRY_DAYS}, got "${daysRaw}"`);
    process.exit(1);
  }

  if (args.includes('--dry-run')) {
    const existing = await store.getUser(uid);
    console.log(`[dry-run] would mint a token named "${name}" for ${uid}`);
    console.log(
      `[dry-run] account ${existing ? 'exists' : 'would be CREATED'}; expiry ${expiresInDays ?? DEFAULT_EXPIRY_DAYS} days`,
    );
    return;
  }

  const { token, record, accountCreated } = await mintAccessTokenFor(store, {
    uid,
    name,
    expiresInDays,
    // Attribution for a CLI mint. Not a uid, and deliberately not shaped like one — the
    // operator here authenticated to Google Cloud, not to this app.
    createdByUid: `cli:${process.env.USER ?? 'unknown'}`,
  });

  if (accountCreated) console.log(`Created account ${record.uid}.`);
  console.log(`Token id : ${record.tokenId}`);
  console.log(`Expires  : ${record.expiresAt}`);
  console.log('');
  console.log('Copy this now — it is not stored and cannot be shown again:');
  console.log('');
  console.log(`  ${token}`);
  console.log('');
  console.log('Put it in the agent environment as GAMEDEV_ACCESS_TOKEN.');
}

async function list(store: FirestoreStore, args: string[]): Promise<void> {
  const uid = args.find((arg) => !arg.startsWith('--'));
  if (!uid) usage();

  const records = await store.listAccessTokens(uid);
  if (records.length === 0) {
    console.log(`No tokens for ${uid}.`);
    return;
  }

  const nowMs = Date.now();
  for (const record of records) {
    const view = toPublicAccessToken(record, nowMs);
    const state = view.expired ? 'EXPIRED' : 'active';
    console.log(
      `${view.tokenId}  ${state.padEnd(7)}  ${view.name.padEnd(24)}  ` +
        `created ${view.createdAt.slice(0, 10)}  expires ${view.expiresAt.slice(0, 10)}  ` +
        `last used ${view.lastUsedAt?.slice(0, 10) ?? 'never'}`,
    );
  }
}

async function revoke(store: FirestoreStore, args: string[]): Promise<void> {
  const tokenId = args.find((arg) => !arg.startsWith('--'));
  if (!tokenId) usage();

  const deleted = await store.deleteAccessToken(tokenId);
  console.log(deleted ? `Revoked ${tokenId}.` : `No token with id ${tokenId}.`);
  if (!deleted) process.exit(1);
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const store = new FirestoreStore();

  try {
    if (action === 'mint') return await mint(store, args);
    if (action === 'list') return await list(store, args);
    if (action === 'revoke') return await revoke(store, args);
    usage();
  } catch (error) {
    if (error instanceof MintAccessTokenError) {
      console.error(`Refused (${error.reason}): ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
