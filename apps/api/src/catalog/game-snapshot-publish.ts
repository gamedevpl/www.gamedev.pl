import type { GameProject } from '@gamedevpl/contract';
import { assembleGameHtml } from './assemble.js';
import {
  generateSnapshotId,
  mediaContentType,
  type GameSnapshotWriter,
  type SnapshotPointer,
} from './game-snapshot.js';
import type { CatalogGameEntry, GitHubClient } from './github-client.js';
import { downscalePng, VARIANT_WIDTHS } from '../image-variants.js';

/**
 * Bakes every published game into the snapshot bucket.
 *
 * This is the one place the expensive work still happens — the same GitHub reads
 * and esbuild bundle the play route used to do per request — and it deliberately
 * reuses `assembleGameHtml` rather than the games repo's own `tools/build.ts`.
 * That assembler is where the restrictive CSP, the AI Act art. 50(2) provenance
 * meta and the credential scan are applied, so baking through it keeps one
 * authoritative definition of "what a served game is". A second implementation on
 * the games-repo side would be a serve-time policy that could drift out of the
 * repo that owns the policy.
 */

export interface PublishSnapshotOptions {
  client: GitHubClient;
  writer: GameSnapshotWriter;
  /** Games-repo ref to bake from. */
  ref: string;
  /** Recorded in the pointer for traceability; not used to address objects. */
  commitSha?: string | null;
  /** Bounds concurrent bake work (GitHub reads plus an esbuild bundle each). */
  concurrency?: number;
  now?: () => Date;
  random?: () => number;
  log?: (message: string) => void;
}

export interface PublishSnapshotFailure {
  slug: string;
  reason: string;
}

export interface PublishSnapshotResult {
  snapshotId: string;
  /** Games written to the snapshot. */
  published: number;
  /**
   * Games in the catalog that could not be baked. A non-empty list means the
   * pointer was left on the previous good snapshot — immutable objects may still
   * have been written under `snapshotId` for debugging.
   */
  failures: PublishSnapshotFailure[];
  mediaFiles: number;
  /** The pointer that was written, or that would have been written on failure. */
  pointer: SnapshotPointer;
}

const DEFAULT_CONCURRENCY = 4;

export async function publishSnapshot(options: PublishSnapshotOptions): Promise<PublishSnapshotResult> {
  const { client, writer, ref } = options;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => {});
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const snapshotId = generateSnapshotId(now(), options.random);
  log(`baking snapshot ${snapshotId} from ${ref}`);

  const catalog = await client.getCatalog(ref);
  const published = catalog.filter((entry) => entry.status === 'published');
  log(`catalog: ${catalog.length} entries, ${published.length} published`);

  const failures: PublishSnapshotFailure[] = [];
  let publishedCount = 0;
  let mediaFiles = 0;

  await mapWithConcurrency(published, concurrency, async (entry) => {
    try {
      const written = await bakeGame({ client, writer, ref, snapshotId, entry });
      publishedCount += 1;
      mediaFiles += written.mediaFiles;
      log(`  ✓ ${entry.slug} (${written.mediaFiles} media)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/\s+/g, ' ').trim().slice(0, 200) : 'unknown error';
      failures.push({ slug: entry.slug, reason });
      log(`  ✗ ${entry.slug}: ${reason}`);
    }
  });

  // The catalog is written whole, including games that failed to bake — useful
  // under the new snapshotId for debugging. Catalog membership is the games
  // repo's decision, not this job's: dropping a failed game from a catalog that
  // then becomes current would silently unpublish it. Instead, when anything
  // failed, we leave `current.json` on the previous good snapshot so the site
  // keeps serving a complete bake.
  await writer.putCatalog(snapshotId, published);

  const pointer: SnapshotPointer = {
    snapshotId,
    commitSha: options.commitSha ?? null,
    publishedAt: now().toISOString(),
    gameCount: publishedCount,
  };

  if (failures.length > 0) {
    log(
      `snapshot ${snapshotId} not published: ${publishedCount} games baked, ${mediaFiles} media, ` +
        `${failures.length} failed — pointer left unchanged`,
    );
    return { snapshotId, published: publishedCount, failures, mediaFiles, pointer };
  }

  // Last, and only after every object is durable: until the pointer moves, the
  // half-written snapshot is invisible and the site keeps serving the previous one.
  await writer.putPointer(pointer);
  log(`published snapshot ${snapshotId}: ${publishedCount} games, ${mediaFiles} media`);

  return { snapshotId, published: publishedCount, failures, mediaFiles, pointer };
}

async function bakeGame(args: {
  client: GitHubClient;
  writer: GameSnapshotWriter;
  ref: string;
  snapshotId: string;
  entry: CatalogGameEntry;
}): Promise<{ mediaFiles: number }> {
  const { client, writer, ref, snapshotId, entry } = args;

  const sources = await client.getGameSources(ref, entry.slug);
  if (!sources) {
    throw new Error('game sources not found on ref');
  }

  const project: GameProject = {
    title: sources.title ?? entry.title ?? entry.slug,
    description: '',
    html: sources.indexHtml,
    js: sources.gameJs,
    css: sources.styleCss,
  };

  // restrictNetwork mirrors the play route exactly: published games are
  // self-contained by repo policy, so they are locked to their own inline assets.
  const html = assembleGameHtml(project, { restrictNetwork: true });
  await writer.putGame(snapshotId, { slug: entry.slug, title: project.title, html });

  const mediaNames = [
    ...(entry.media?.screenshots.map((screenshot) => screenshot.file) ?? []),
    ...(entry.media?.video ? [entry.media.video] : []),
  ];

  let mediaFiles = 0;
  for (const filename of mediaNames) {
    const bytes = await client.getGameMedia(ref, entry.slug, filename);
    if (!bytes) {
      // Catalog metadata is generated from what is committed, so a gap here is
      // odd but not fatal to the game bake — the media route will 404 for this
      // filename until a later bake catches up.
      continue;
    }
    const body = Buffer.from(bytes);
    await writer.putMedia(snapshotId, entry.slug, filename, {
      body,
      contentType: mediaContentType(filename),
    });
    mediaFiles += 1;

    // Size variants for screenshots. The arcade shows the same file at ~48 CSS px in
    // the moment strip and a few hundred as a card poster; serving the original for
    // both means decoding a full screenshot for every near-fold poster (and again for
    // each moment thumb after engage), and a PNG cannot be decoded partially. A
    // variant that cannot be produced is simply not written — the media route falls
    // back to the original, which is what every snapshot baked before this contains.
    if (filename.endsWith('.png')) {
      for (const width of VARIANT_WIDTHS) {
        const scaled = downscalePng(body, width);
        if (!scaled) continue;
        await writer.putMedia(
          snapshotId,
          entry.slug,
          filename,
          { body: scaled, contentType: mediaContentType(filename) },
          width,
        );
        mediaFiles += 1;
      }
    }
  }

  return { mediaFiles };
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}
