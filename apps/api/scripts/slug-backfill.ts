// Give an address to every game still missing one, from the command line.
//
//   npm run slug:backfill -w @gamedevpl/api -- --dry-run   # report, write nothing
//   npm run slug:backfill -w @gamedevpl/api --             # actually name them
//
// The operator sibling of POST /api/admin/slug-backfill, for when nobody can reach an
// admin browser session. Both call `runSlugBackfill`, so the work list, the collision
// rules and the claim read-back cannot drift between them — which matters more here than
// usual, because a slug is a permanent public address.
//
// Talks to Firestore with your ambient gcloud credentials, like `beta:approve` and
// `token:mint`. There is no dev/prod switch — check `gcloud config get-value project`
// before running this against the live site, and always rehearse with --dry-run first.
//
// The one thing the store cannot answer on its own is whether a name is already taken by
// a game published from the games repo. The server asks GitHub (or the snapshot); this
// reads the published snapshot in GCS, which is what production actually serves and which
// the same gcloud credentials can already read — no GitHub token needed. If that read
// fails the run stops rather than mint a name that may collide; --skip-catalog proceeds
// anyway, which is only safe when you know the backlog's titles.

import { createGcsSnapshotStore } from '../src/catalog/game-snapshot.js';
import { runSlugBackfill } from '../src/catalog/slug-backfill.js';
import { FirestoreStore } from '../src/store.js';

// Same default as infra/deploy-api.sh: ${PROJECT_ID}-games-snapshots.
const SNAPSHOT_BUCKET = process.env.GAMES_SNAPSHOT_BUCKET ?? 'gamedevpl-games-snapshots';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  slug:backfill -- --dry-run      # show what it would name, write nothing',
      '  slug:backfill --                # name them',
      '',
      'Options:',
      '  --skip-catalog                  # do not check names against published games',
    ].join('\n'),
  );
  process.exit(1);
}

/** Slugs already spoken for by a game in the published snapshot. */
async function loadPublishedSlugs(): Promise<Set<string>> {
  const entries = await createGcsSnapshotStore({ bucket: SNAPSHOT_BUCKET }).getCatalog();
  if (!entries) throw new Error('no snapshot is published');
  // Every entry, not just the published ones: a name that has been taken down is still
  // spent, and handing it to a different game would resurrect a dead address.
  return new Set(entries.map((entry) => entry.slug));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.find((arg) => !['--dry-run', '--skip-catalog'].includes(arg));
  if (unknown) usage();

  const dryRun = args.includes('--dry-run');
  const skipCatalog = args.includes('--skip-catalog');

  let published = new Set<string>();
  if (skipCatalog) {
    console.error('warning: skipping the published-catalog check; a minted name may collide with a published game');
  } else {
    try {
      published = await loadPublishedSlugs();
      console.error(`catalog: ${published.size} published slug(s) treated as taken (gs://${SNAPSHOT_BUCKET})`);
    } catch (error) {
      console.error(`Could not read the published catalog: ${(error as Error).message}`);
      console.error('Retry, or pass --skip-catalog to name games without that check.');
      process.exit(1);
    }
  }

  const store = new FirestoreStore();

  // The store half of the server's `isSlugClaimed`: another submission, or a game
  // published through the store. `except` excuses a record's own slug, which is what
  // makes the claim read-back's retry able to keep a name it already holds.
  const isSlugClaimed = async (slug: string, except?: number): Promise<boolean> => {
    if (published.has(slug)) return true;
    const existing = await store.getSubmissionBySlug(slug);
    if (existing && existing.issueNumber !== except) return true;
    return Boolean(await store.getPublication(slug));
  };

  const result = await runSlugBackfill({ store, isSlugClaimed, dryRun });
  console.log(JSON.stringify(result, null, 2));

  if (result.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('slug backfill failed:', error);
  process.exit(1);
});
