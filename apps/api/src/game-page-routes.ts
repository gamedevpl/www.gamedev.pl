import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { profileBylineName, toPublicCreatorProfile, type PublicCreatorProfile } from './creator-profile.js';
import { GAME_BUDGET_BYTES, GAME_KIT_MODULES } from './games-repo-contract.js';
import { catalogEntryFromSpec, type CatalogGameEntry, type GitHubClient } from './github-client.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { DELETED_ACCOUNT_UID, type Store } from './store.js';

/**
 * The public game page — `GET /api/games/:slug/page`.
 *
 * One aggregate read behind the "repo page" layout at `/:handle/:slug` (see the ops
 * plan `docs/game-page-plan.md`, private repo): catalog metadata, the SPEC.md body,
 * GameKit module composition, the author byte budget, release history from the games
 * store, and the public play aggregate. Exempted from the private-beta wall the same
 * way `/api/creators/:handle` is — the page is a landing page, and only *playing*
 * stays gated during closed beta.
 *
 * Everything textual here is agent- or creator-authored: the client must render it
 * escaped (the SPEC body goes through the safe markdown renderer, never innerHTML).
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SlugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(64),
});

export interface GamePageRelease {
  version: string;
  createdAt: string;
  /** True for the version the play route serves right now. */
  current: boolean;
  /** Acceptance verdict — provenance, not health. Null for legacy manifests. */
  gateGreen: boolean | null;
  /** `'editor'` marks a content-only Studio publish (no agent round). */
  origin?: 'editor';
}

export interface GamePageStats {
  /** Play sessions in the scorecard's rolling window (28 days), not lifetime. */
  plays: number;
  medianPlaySeconds: number | null;
  windowDays: number;
}

export interface GamePageResponse {
  entry: CatalogGameEntry;
  creator: PublicCreatorProfile | null;
  /**
   * SPEC.md with the catalog frontmatter stripped — the game's own README.
   * Agent-authored markdown; the client renders it through a sanitising renderer.
   */
  specMarkdown: string | null;
  /** GameKit modules the game composes, canonical order. Null when unreadable. */
  modules: string[] | null;
  /** Author source bytes against the games-repo budget. Store-delivered games only. */
  budget: { usedBytes: number; limitBytes: number } | null;
  /** Newest first. Empty for repo-committed games (their history lives in git). */
  releases: GamePageRelease[];
  stats: GamePageStats | null;
}

export interface GamePageRoutesOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  getRepoPublishedCatalogEntry?: (slug: string) => Promise<CatalogGameEntry | null>;
  /** Repo reads for migrated games (SPEC.md / GAME.json off the published ref). */
  githubClient?: GitHubClient | null;
  publishedRef?: string;
  now?: () => number;
  cacheTtlMs?: number;
}

/** Strip the flat `--- … ---` frontmatter block; what remains is the human half. */
export function stripSpecFrontmatter(specMd: string): string {
  return specMd.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

/**
 * Tolerant module read: the page must render for a game whose GAME.json a stricter
 * parser would refuse (older deliveries predate several validation rules). Unknown
 * names are dropped, order is normalised to the canonical list, and any parse
 * failure is "no module data", never a 500.
 */
export function readGameModules(gameJsonSource: string | null): string[] | null {
  if (!gameJsonSource) return null;
  try {
    const parsed = JSON.parse(gameJsonSource) as { engine?: { modules?: unknown } };
    const raw = parsed.engine?.modules;
    if (!Array.isArray(raw)) return null;
    const named = new Set(raw.filter((name): name is string => typeof name === 'string'));
    return GAME_KIT_MODULES.filter((name) => named.has(name));
  } catch {
    return null;
  }
}

export async function registerGamePageRoutes(app: FastifyInstance, options: GamePageRoutesOptions): Promise<void> {
  const { store, gamesStore, getRepoPublishedCatalogEntry, githubClient } = options;
  const publishedRef = options.publishedRef ?? 'main';
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;

  // Assembling a page costs a dozen store reads (budget = every source file's bytes).
  // Cached whole, briefly and bounded: page data moves on publish, not per request.
  const cache = new Map<string, { value: GamePageResponse; expiresAt: number }>();

  app.get('/api/games/:slug/page', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }
    const slug = params.data.slug;

    const cached = cache.get(slug);
    if (cached && cached.expiresAt > now()) {
      return reply.send(cached.value);
    }

    try {
      const body = await buildGamePage(slug);
      if (!body) return reply.status(404).send({ error: 'not_found' });
      if (cache.size >= 500) cache.clear();
      cache.set(slug, { value: body, expiresAt: now() + cacheTtlMs });
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to build game page');
      return reply.status(502).send({ error: 'failed to load game page' });
    }
  });

  async function buildGamePage(slug: string): Promise<GamePageResponse | null> {
    // Same precedence as the play and media routes: a migrated repo copy wins.
    const repoEntry = getRepoPublishedCatalogEntry ? await getRepoPublishedCatalogEntry(slug) : null;
    const publication = await store.getPublication(slug);
    const storePublished = publication?.state === 'published' ? publication : null;
    if (!repoEntry && !storePublished) return null;
    if (repoEntry && repoEntry.status !== 'published' && !storePublished) return null;

    // Attribution joins at read time from the owner's profile — never from SPEC.
    const submission = await store.getSubmissionBySlug(slug);
    const erased = submission?.ownerUid === DELETED_ACCOUNT_UID;
    const owner = submission && !erased ? await store.getUser(submission.ownerUid) : null;
    const creator = owner ? toPublicCreatorProfile(owner) : null;

    let specMd: string | null = null;
    let gameJson: string | null = null;
    let entry: CatalogGameEntry | null = repoEntry;
    let budget: GamePageResponse['budget'] = null;

    if (storePublished && gamesStore) {
      const version = storePublished.currentVersion;
      const [storeSpec, storeGameJson, manifest, mediaMetadata] = await Promise.all([
        gamesStore.getSourceFile(slug, version, 'SPEC.md'),
        gamesStore.getSourceFile(slug, version, 'GAME.json'),
        gamesStore.getManifest(slug, version),
        gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json'),
      ]);
      specMd = storeSpec;
      gameJson = storeGameJson;
      if (!entry && storeSpec) {
        entry = catalogEntryFromSpec(slug, storeSpec, (name) =>
          name === 'media/metadata.json' && mediaMetadata ? mediaMetadata.toString('utf8') : null,
        );
      }
      budget = await sumAuthorBytes(gamesStore, slug, version, manifest);
    }

    if (repoEntry && githubClient) {
      // Repo games: SPEC/GAME.json come off the published ref. The closed read list
      // in getGameFile is the boundary — this route never names arbitrary paths.
      const [repoSpec, repoGameJson] = await Promise.all([
        specMd ? Promise.resolve(specMd) : githubClient.getGameFile(publishedRef, slug, 'SPEC.md'),
        gameJson ? Promise.resolve(gameJson) : githubClient.getGameFile(publishedRef, slug, 'GAME.json'),
      ]);
      specMd = repoSpec ?? specMd;
      gameJson = repoGameJson ?? gameJson;
    }

    if (!entry) return null;

    const releases = await listReleases(gamesStore ?? null, slug, storePublished?.currentVersion ?? null);
    const stats = await readStats(store, slug);

    return {
      entry: {
        ...entry,
        status: 'published',
        submittedBy: erased ? 'gamedev-platform' : creator ? profileBylineName(creator) : entry.submittedBy,
        creatorHandle: erased ? null : (creator?.handle ?? entry.creatorHandle ?? null),
      },
      creator: erased ? null : creator,
      specMarkdown: specMd ? stripSpecFrontmatter(specMd) : null,
      modules: readGameModules(gameJson),
      budget,
      releases,
      stats,
    };
  }
}

async function sumAuthorBytes(
  gamesStore: GamesStore,
  slug: string,
  version: string,
  manifest: VersionManifest | null,
): Promise<{ usedBytes: number; limitBytes: number } | null> {
  if (!manifest || manifest.sourceFiles.length === 0) return null;
  try {
    const sizes = await Promise.all(
      manifest.sourceFiles.map(async (path) => {
        const content = await gamesStore.getSourceFile(slug, version, path);
        return content === null ? 0 : Buffer.byteLength(content, 'utf8');
      }),
    );
    return { usedBytes: sizes.reduce((sum, bytes) => sum + bytes, 0), limitBytes: GAME_BUDGET_BYTES };
  } catch {
    // The gauge is garnish; a store hiccup must not take the page down with it.
    return null;
  }
}

async function listReleases(
  gamesStore: GamesStore | null,
  slug: string,
  currentVersion: string | null,
): Promise<GamePageRelease[]> {
  // `typeof` guard: hand-rolled test fakes predate listVersions, and a page for a
  // repo game has no store history at all — both must degrade to an empty list.
  if (!gamesStore || typeof gamesStore.listVersions !== 'function') return [];
  try {
    const manifests = await gamesStore.listVersions(slug, { limit: 30 });
    return manifests
      .filter((manifest) => manifest.deliveryMode !== 'preview')
      .map((manifest) => ({
        version: manifest.version,
        createdAt: manifest.createdAt,
        current: manifest.version === currentVersion,
        gateGreen: manifest.gate ? manifest.gate.green : null,
        ...(manifest.origin === 'editor' ? { origin: 'editor' as const } : {}),
      }));
  } catch {
    return [];
  }
}

async function readStats(store: Store, slug: string): Promise<GamePageStats | null> {
  try {
    const scorecard = await store.getScorecard(slug);
    if (!scorecard) return null;
    return {
      plays: scorecard.sessions.count,
      medianPlaySeconds: scorecard.sessions.count > 0 ? scorecard.sessions.medianPlaySeconds : null,
      windowDays: scorecard.window.days.length,
    };
  } catch {
    return null;
  }
}
