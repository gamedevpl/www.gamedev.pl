/**
 * Bakes the published games into the snapshot bucket and flips the pointer.
 *
 * This moves game assembly off the request path: instead of every cache-cold play
 * rebuilding a game from a fan-out of GitHub reads plus an esbuild bundle, a merge
 * to the games repo's default branch bakes every published game once and the site
 * serves the result. GitHub stays the source of truth for content and for
 * unmerged PR / draft previews; it is not a published-serve fallback when the
 * snapshot bucket is configured.
 *
 * A non-empty failures list leaves `current.json` on the previous good snapshot
 * (immutable objects under the new id may still be written for debugging) and
 * exits non-zero — without a serve-time GitHub fallback, advancing the pointer
 * on a partial bake would half-publish failed games.
 *
 * Run by .github/workflows/publish-games.yml on a repository_dispatch from the
 * games repo (and manually via workflow_dispatch). Safe to re-run: each successful
 * run writes a fresh immutable snapshot prefix and only then moves `current.json`.
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
 *   npm run snapshot:publish -w @gamedevpl/api -- --ref main --commit-sha <sha>
 *
 * `--commit-sha` is not just metadata: when present it is the ref every read
 * is pinned to, so a bake is a photograph of one tree rather than of whatever
 * the branch pointed at during each request. See `ref` below.
 */

import { publishSnapshot } from '../src/catalog/game-snapshot-publish.js';
import { createGcsSnapshotStore, type GameSnapshotWriter, type SnapshotPointer } from '../src/catalog/game-snapshot.js';
import { fetchGamesRepoArchive } from '../src/platform/games-repo-archive.js';
import { createGitHubClient, type RepoFileSource } from '../src/catalog/github-client.js';

function readFlag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

const dryRun = process.argv.includes('--dry-run');
const repo = (process.env.GAMES_REPO ?? 'gamedevpl/www.gamedev.pl-games').trim();
const requestedRef = (readFlag('ref') ?? process.env.GAMES_PUBLISHED_REF ?? 'main').trim();
// Normalized once, then used for both the ref below and the pointer metadata.
// Keeping an untrimmed copy for the pointer would reintroduce, in miniature,
// the exact failure this script is being fixed for: a `--commit-sha "  "` that
// reads from the branch while recording whitespace as the commit it read.
const commitSha = readFlag('commit-sha')?.trim() || null;

/**
 * What the bake actually reads.
 *
 * A branch name is a moving target. The games repo used to push a refreshed
 * `catalog.json` and dispatch this job seconds later, so resolving `main`
 * here could still land on the pre-push tree — and it did: a merge that added
 * a game published a snapshot of the previous 92 while recording the newer
 * commit in the pointer. Green run, correct-looking metadata, missing game,
 * and nothing else retires that snapshot until the next merge or the nightly
 * re-bake. The bake now derives the catalog from the pinned archive itself.
 *
 * The dispatch already tells us the exact commit, so bake that. `ref` stays
 * the fallback for callers that cannot name one (a manual bake, the nightly).
 * Both the archive download and every read below use this one value, which is
 * what keeps them consistent — `games-repo-archive` refuses to serve a ref it
 * does not hold, and rightly so.
 */
const ref = commitSha || requestedRef;
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

  // One tarball instead of a read per file. A bake touches nearly every file in
  // the games repo, and the per-file version cost ~1,000 requests against a token
  // shared with CI — enough, at a bake per push, to exhaust its hourly budget and
  // 403 everything else holding it. If the download fails the bake still runs the
  // old way: slower and expensive, but a stale snapshot is worse.
  let files: RepoFileSource | undefined;
  try {
    const archive = await fetchGamesRepoArchive({ repo, ref, token });
    files = archive;
    console.log(
      `snapshot publish: archive ${repo}@${ref} — ${archive.fileCount} files, ` +
        `${(archive.byteCount / 1024 / 1024).toFixed(1)} MiB, 1 request`,
    );
  } catch (error: unknown) {
    console.warn(
      `snapshot publish: archive download failed (${error instanceof Error ? error.message : String(error)}) — ` +
        'falling back to per-file contents reads',
    );
  }

  const client = createGitHubClient({ token, repo, files });
  const writer = dryRun ? createDryRunWriter() : createGcsSnapshotStore({ bucket });

  console.log(
    `snapshot publish: ${repo}@${ref}` +
      (ref === requestedRef ? '' : ` (${requestedRef} pinned at this commit)`) +
      ` → ${dryRun ? '(dry run, nothing written)' : `gs://${bucket}`}`,
  );

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
    // The pointer was left unchanged — without a serve-time GitHub fallback,
    // advancing it on a partial bake would half-publish failed games. The site
    // keeps serving the previous good snapshot until a clean bake succeeds.
    console.error('');
    console.error('games that could not be baked (pointer not advanced; previous snapshot still live):');
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
