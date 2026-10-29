import { publishSnapshot } from '../src/catalog/game-snapshot-publish.js';
import { createGcsSnapshotStore, type GameSnapshotWriter, type SnapshotPointer } from '../src/catalog/game-snapshot.js';
import { withArchiveCommitCounts } from '../src/catalog/catalog-commit-counts.js';
import { fetchGamesRepoArchive } from '../src/platform/games-repo-archive.js';
import { createGitHubClient, type RepoFileSource } from '../src/catalog/github-client.js';
import { createGameArtifactBrowser } from '../src/catalog/game-artifact-browser.js';

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
let ref = commitSha || requestedRef;
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
  if (!/^[0-9a-f]{40}$/i.test(ref)) {
    const sha = await createGitHubClient({ token, repo }).getRefSha(ref);
    if (!sha || !/^[0-9a-f]{40}$/i.test(sha)) fail('could not pin games ref to a commit');
    ref = sha;
  }

  // One tarball instead of a read per file. A bake touches nearly every file in
  // the games repo, and the per-file version cost ~1,000 requests against a token
  // shared with CI — enough, at a bake per push, to exhaust its hourly budget and
  // 403 everything else holding it. If the download fails the bake still runs the
  // old way: slower and expensive, but a stale snapshot is worse.
  let files: RepoFileSource | undefined;
  try {
    const archive = await fetchGamesRepoArchive({ repo, ref, token, maxTotalBytes: 4 * 1024 ** 3 });
    files = await withArchiveCommitCounts(archive, { repo, ref, token });
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

  const browser = await createGameArtifactBrowser({
    executablePath: process.env.E2E_CHROMIUM_PATH ?? '',
    noSandbox: process.env.E2E_CHROMIUM_NO_SANDBOX === '1',
  });
  const result = await publishSnapshot({
    client,
    writer,
    ref,
    commitSha: ref,
    verifyGame: browser.verify,
    log: (message) => console.log(message),
  }).finally(() => browser.close());

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
    console.error('FAIL games that could not be baked (pointer not advanced; previous snapshot still live):');
    for (const failure of result.failures) {
      console.error(`FAIL ${failure.slug}: ${failure.reason}`);
    }
    process.exit(1);
  }

  console.log('snapshot publish: ok');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
