/**
 * Bakes the published games into the snapshot bucket and flips the pointer.
 *
 * This moves game assembly off the request path: instead of every cache-cold play
 * rebuilding a game from a fan-out of GitHub reads plus an esbuild bundle, a merge
 * to the games repo's default branch bakes every published game once and the site
 * serves the result. GitHub stays in the picture only for unmerged PR previews and
 * as the fallback when a game is missing from the snapshot.
 *
 * Run by .github/workflows/publish-games.yml on a repository_dispatch from the
 * games repo (and manually via workflow_dispatch). Safe to re-run: each run writes
 * a fresh immutable snapshot prefix and only then moves `current.json`.
 *
 * Environment:
 *   GAMES_SNAPSHOT_BUCKET  target GCS bucket (required unless --dry-run)
 *   GAMES_REPO_TOKEN       contents:read PAT on the games repo (or GITHUB_TOKEN)
 *   GAMES_REPO             defaults to gamedevpl/www.gamedev.pl-games
 *   GAMES_PUBLISHED_REF    defaults to main
 *
 * Usage:
 *   npm run snapshot:publish -w @gamedevpl/api
 *   npm run snapshot:publish -w @gamedevpl/api -- --dry-run
 *   npm run snapshot:publish -w @gamedevpl/api -- --ref <sha> --commit-sha <sha>
 */

import { publishSnapshot } from '../src/game-snapshot-publish.js';
import { createGcsSnapshotStore, type GameSnapshotWriter, type SnapshotPointer } from '../src/game-snapshot.js';
import { createGitHubClient } from '../src/github-client.js';

function readFlag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const dryRun = process.argv.includes('--dry-run');
const repo = (process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games').trim();
const ref = (readFlag('ref') ?? process.env.GAMES_PUBLISHED_REF ?? 'main').trim();
const commitSha = readFlag('commit-sha');
const bucket = (process.env.GAMES_SNAPSHOT_BUCKET ?? '').trim();
const token = (process.env.GAMES_REPO_TOKEN ?? process.env.GITHUB_TOKEN ?? '').trim();

function fail(message: string): never {
  console.error(`snapshot publish: ${message}`);
  process.exit(1);
}

/** Counts what a real run would write, without touching the bucket. */
function createDryRunWriter(): GameSnapshotWriter & { pointer: SnapshotPointer | null } {
  return {
    pointer: null,
    async putCatalog() {},
    async putGame() {},
    async putMedia() {},
    async putPointer(pointer) {
      this.pointer = pointer;
    },
  };
}

async function main(): Promise<void> {
  if (!token) {
    fail('GAMES_REPO_TOKEN (or GITHUB_TOKEN) is required to read the games repo');
  }
  if (!bucket && !dryRun) {
    fail('GAMES_SNAPSHOT_BUCKET is required (or pass --dry-run)');
  }

  const client = createGitHubClient({ token, repo });
  const writer = dryRun ? createDryRunWriter() : createGcsSnapshotStore({ bucket });

  console.log(`snapshot publish: ${repo}@${ref} → ${dryRun ? '(dry run, nothing written)' : `gs://${bucket}`}`);

  const result = await publishSnapshot({
    client,
    writer,
    ref,
    commitSha,
    log: (message) => console.log(message),
  });

  console.log('');
  console.log(`  snapshot id : ${result.snapshotId}`);
  console.log(`  games       : ${result.published}`);
  console.log(`  media files : ${result.mediaFiles}`);
  console.log(`  failures    : ${result.failures.length}`);

  if (result.failures.length > 0) {
    // The pointer has already moved — a game that fails to bake falls back to the
    // GitHub path and keeps working, so a partial snapshot is better than none.
    // But a failure means a published game is no longer being served the cheap
    // way, and the games repo's own gate should have caught it, so end red.
    console.error('');
    console.error('games that could not be baked (serving falls back to GitHub for these):');
    for (const failure of result.failures) {
      console.error(`  - ${failure.slug}: ${failure.reason}`);
    }
    process.exit(1);
  }

  console.log('snapshot publish: ok');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
