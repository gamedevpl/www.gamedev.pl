// What the seed generator is allowed to learn from: the catalog, published game sources,
// and the game template.
//
// The retrieval question here has an unusually easy answer, and it is worth saying why
// rather than reaching for the expected machinery. The catalog is a curated
// one-good-game-per-genre collection, not a long tail — so the entire index of
// `slug — title — genre` is a few hundred tokens and fits in the picker's prompt whole.
// There is nothing for an embedding index to do that a single cheap model call does not
// already do better, and every vector store we did not build is a store we do not have to
// keep in sync with the catalog.
//
// Sources come from the games-repo tarball for the same reason the snapshot bake uses it:
// one request instead of a thousand, on a token whose budget is shared with serving. The
// archive is cached across dispatches because it changes only when the harness moves, and
// re-downloading the repo per build would make seeding cost more than it saves.

import { fetchGamesRepoArchive, type GamesRepoArchive } from './games-repo-archive.js';

/** Text-only: sources, specs, manifests, the catalog and the templates. No media. */
const TEXT_EXTENSIONS = ['.ts', '.json', '.md', '.css', '.html'];

/**
 * Which archive paths the seeder keeps.
 *
 * Media is the whole reason the games repo is large and none of it can enter a text
 * prompt, so it is dropped at the tar boundary rather than downloaded into memory and
 * ignored. `shared/` is excluded too: GameKit's own source is far larger than the
 * reference budget, and a game's *use* of the engine — which is what the model needs to
 * copy — is visible in the reference games themselves.
 */
function seedInclude(relativePath: string): boolean {
  if (relativePath === 'catalog.json') return true;
  const inScope = relativePath.startsWith('games/') || relativePath.startsWith('templates/');
  return inScope && TEXT_EXTENSIONS.some((extension) => relativePath.endsWith(extension));
}

/** Order matters: this is the shape a game has, and the order the model sees it in. */
const GAME_TOP_LEVEL_FILES = ['SPEC.md', 'GAME.json', 'game.ts', 'index.html', 'style.css', 'ACCEPTANCE.json'];

/** One reference file this big is a generated blob, not something to learn a style from. */
const MAX_REFERENCE_FILE_BYTES = 80_000;

/** The template is small; this only stops a pathological repo state from filling context. */
const CONTEXT_SCAFFOLD_BUDGET = 60_000;

export interface SeedContext {
  /** `slug — title — genre` per published game, the picker's whole world. */
  catalogIndex: string;
  /** The `templates/game` skeleton, rendered in the same fence format as references. */
  scaffold: string;
  hasGame(slug: string): boolean;
  /** Full source of the picked games, in fence format, truncated to a byte budget. */
  renderReferences(slugs: string[], byteBudget: number): string;
}

export interface SeedContextSource {
  /** Null when context cannot be assembled — the caller then dispatches unseeded. */
  load(): Promise<SeedContext | null>;
}

interface CatalogEntry {
  slug?: unknown;
  title?: unknown;
  genre?: unknown;
  status?: unknown;
}

/**
 * A file index over the archive, since `RepoFileSource` can read a path but not list one
 * — and the seeder has to enumerate a game's modules without knowing their names.
 */
export interface SeedFileIndex {
  paths: string[];
  read(path: string): string | null;
}

export function buildSeedContext(index: SeedFileIndex): SeedContext | null {
  const catalogRaw = index.read('catalog.json');
  if (!catalogRaw) return null;

  let entries: CatalogEntry[];
  try {
    const parsed: unknown = JSON.parse(catalogRaw);
    entries = Array.isArray(parsed) ? (parsed as CatalogEntry[]) : [];
  } catch {
    return null;
  }

  const published = entries.filter(
    (entry): entry is { slug: string; title: string; genre: string } =>
      typeof entry.slug === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.genre === 'string' &&
      // A disabled or archived game is not a model to copy: it is either broken or
      // withdrawn, and either way it should not shape a new game's first draft.
      (entry.status === undefined || entry.status === 'published'),
  );
  if (published.length === 0) return null;

  const slugs = new Set(published.map((entry) => entry.slug));

  function listGameFiles(root: string): string[] {
    const prefix = `${root}/`;
    const top = GAME_TOP_LEVEL_FILES.map((name) => `${prefix}${name}`).filter((path) => index.read(path) !== null);
    // Modules sorted so the same game always renders identically — a prompt that varies
    // run to run makes every comparison between runs meaningless.
    const modules = index.paths
      .filter((path) => path.startsWith(`${prefix}game/`) && path.endsWith('.ts'))
      .sort((a, b) => a.localeCompare(b));
    return [...top, ...modules];
  }

  function renderTree(root: string, label: string, budget: { remaining: number }): string {
    const chunks: string[] = [];
    for (const filePath of listGameFiles(root)) {
      const content = index.read(filePath);
      if (content === null) continue;
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_REFERENCE_FILE_BYTES || bytes > budget.remaining) continue;
      budget.remaining -= bytes;
      chunks.push(`--- ${label}/${filePath.slice(root.length + 1)} ---\n${content}`);
    }
    return chunks.join('\n');
  }

  return {
    catalogIndex: published.map((entry) => `${entry.slug} — ${entry.title} — ${entry.genre}`).join('\n'),
    scaffold: renderTree('templates/game', 'games/<slug>', { remaining: CONTEXT_SCAFFOLD_BUDGET }),
    hasGame: (slug: string) => slugs.has(slug),
    renderReferences(picks: string[], byteBudget: number): string {
      const budget = { remaining: byteBudget };
      return picks
        .filter((slug) => slugs.has(slug))
        .map((slug) => renderTree(`games/${slug}`, `games/${slug}`, budget))
        .filter((chunk) => chunk.length > 0)
        .join('\n\n');
    },
  };
}

export interface ArchiveSeedContextOptions {
  repo: string;
  ref: string;
  token: string;
  /** How long a downloaded archive is reused. The harness moves on merges, not minutes. */
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  log?: { warn: (context: object, message: string) => void; info: (context: object, message: string) => void };
}

export const DEFAULT_SEED_CONTEXT_TTL_MS = 10 * 60_000;

/**
 * Archive-backed context with a single-flight cache.
 *
 * Single-flight matters more than the TTL does: two creators submitting at once would
 * otherwise each download the repository, and the second download is pure waste on the
 * one credential that also serves the catalog. Concurrent callers share the in-flight
 * promise; a failure is not cached, so the next dispatch retries rather than inheriting
 * someone else's bad minute.
 */
export function createArchiveSeedContextSource(options: ArchiveSeedContextOptions): SeedContextSource {
  const ttlMs = options.ttlMs ?? DEFAULT_SEED_CONTEXT_TTL_MS;
  let cached: { context: SeedContext; expiresAt: number } | null = null;
  let inFlight: Promise<SeedContext | null> | null = null;

  async function download(): Promise<SeedContext | null> {
    const archive: GamesRepoArchive = await fetchGamesRepoArchive({
      repo: options.repo,
      ref: options.ref,
      token: options.token,
      include: seedInclude,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });

    // Materialized once into a synchronous index: the renderer walks it per dispatch,
    // and awaiting a read per file inside a prompt builder would be a lot of ceremony
    // for bytes that are already in memory.
    const paths = archive.listPaths();
    const contents = new Map<string, string>();
    for (const path of paths) {
      const text = await archive.readText(path, options.ref);
      if (text !== null) contents.set(path, text);
    }

    const context = buildSeedContext({ paths, read: (path) => contents.get(path) ?? null });
    if (!context) {
      options.log?.warn({ repo: options.repo, ref: options.ref }, 'seed context unusable: no catalog in archive');
      return null;
    }
    options.log?.info({ repo: options.repo, ref: options.ref, files: paths.length }, 'seed context loaded');
    return context;
  }

  return {
    async load(): Promise<SeedContext | null> {
      const now = Date.now();
      if (cached && cached.expiresAt > now) return cached.context;
      if (inFlight) return inFlight;

      inFlight = download()
        .then((context) => {
          // Only a usable context is cached. Caching a null would turn one bad fetch into
          // ten minutes of unseeded builds for no reason.
          if (context) cached = { context, expiresAt: Date.now() + ttlMs };
          return context;
        })
        .catch((error: unknown) => {
          options.log?.warn({ err: error, repo: options.repo, ref: options.ref }, 'seed context fetch failed');
          return null;
        })
        .finally(() => {
          inFlight = null;
        });

      return inFlight;
    },
  };
}
