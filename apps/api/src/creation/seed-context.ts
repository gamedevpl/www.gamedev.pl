import { fetchGamesRepoArchive, type GamesRepoArchive } from '../platform/games-repo-archive.js';
import { ArchiveLimitError } from '../platform/tar.js';

export const SEED_SCAFFOLD_SLUG = 'rook-rush';

export const MAX_SEED_CONTEXT_BYTES = 32 * 1024 * 1024;
export const MAX_SEED_CONTEXT_FILE_BYTES = 2 * 1024 * 1024;
export const SEED_CONTEXT_BREAKER_COOLDOWN_MS = 5 * 60_000;
const SEED_CONTEXT_BREAKER_THRESHOLD = 3;

function seedInclude(relativePath: string): boolean {
  if (relativePath === 'catalog.json' || relativePath === 'shared/game-kit.d.ts') return true;
  const match = /^games\/[^/]+\/(.+)$/.exec(relativePath);
  if (!match) return false;
  const path = match[1];
  return GAME_TOP_LEVEL_FILES.includes(path) || (path.startsWith('game/') && path.endsWith('.ts'));
}

const GAME_TOP_LEVEL_FILES = [
  'SPEC.md',
  'GAME.json',
  'EDITOR.json',
  'EDITOR.content.json',
  'game.ts',
  'index.html',
  'style.css',
  'ACCEPTANCE.json',
];

const MAX_REFERENCE_FILE_BYTES = 80_000;

const CONTEXT_SCAFFOLD_BUDGET = 8_000;

export interface SeedContext {
  catalogIndex: string;
  scaffold: string;
  kitDeclaration: string | null;
  hasGame(slug: string): boolean;
  renderReferences(slugs: string[], byteBudget: number): string;
}

export interface SeedContextSource {
  load(): Promise<SeedContext | null>;
}

interface CatalogEntry {
  slug?: unknown;
  title?: unknown;
  genre?: unknown;
  status?: unknown;
  listed?: unknown;
}

export interface SeedFileIndex {
  paths: string[];
  read(path: string): string | null;
}

export function buildSeedContext(index: SeedFileIndex, catalogEntries?: CatalogEntry[] | null): SeedContext | null {
  let entries: CatalogEntry[];
  if (catalogEntries !== undefined) {
    if (!catalogEntries) return null;
    entries = catalogEntries;
  } else {
    const catalogRaw = index.read('catalog.json');
    if (!catalogRaw) return null;
    try {
      const parsed: unknown = JSON.parse(catalogRaw);
      entries = Array.isArray(parsed) ? (parsed as CatalogEntry[]) : [];
    } catch {
      return null;
    }
  }

  const published = entries.filter(
    (entry): entry is { slug: string; title: string; genre: string } =>
      typeof entry.slug === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.genre === 'string' &&
      (entry.status === undefined || entry.status === 'published') &&
      entry.listed !== false,
  );
  if (published.length === 0) return null;

  const slugs = new Set(published.map((entry) => entry.slug));

  function listGameFiles(root: string): string[] {
    const prefix = `${root}/`;
    const top = GAME_TOP_LEVEL_FILES.map((name) => `${prefix}${name}`).filter((path) => index.read(path) !== null);
    const modules = index.paths
      .filter((path) => path.startsWith(`${prefix}game/`) && path.endsWith('.ts'))
      .sort((a, b) => a.localeCompare(b));
    return [...top, ...modules];
  }

  function renderTree(root: string, label: string, budget: { remaining: number }, priority: string[] = []): string {
    const chunks: string[] = [];
    const files = listGameFiles(root);
    const first = priority.map((name) => `${root}/${name}`).filter((name) => files.includes(name));
    for (const filePath of [...first, ...files.filter((name) => !first.includes(name))]) {
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
    // Withdrawn games must not shape new drafts.
    scaffold: slugs.has(SEED_SCAFFOLD_SLUG)
      ? renderTree(`games/${SEED_SCAFFOLD_SLUG}`, 'games/<slug>', { remaining: CONTEXT_SCAFFOLD_BUDGET }, [
          'GAME.json',
          'game.ts',
          'game/boot.ts',
          'game/behavior.ts',
        ])
      : '',
    kitDeclaration: index.read('shared/game-kit.d.ts'),
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
  ttlMs?: number;
  fetchImpl?: typeof fetch;
  log?: { warn: (context: object, message: string) => void; info: (context: object, message: string) => void };
  // Published catalog from the GCS snapshot; the archive no longer has one.
  getCatalog?: () => Promise<CatalogEntry[] | null>;
}

export const DEFAULT_SEED_CONTEXT_TTL_MS = 10 * 60_000;

export function createArchiveSeedContextSource(options: ArchiveSeedContextOptions): SeedContextSource {
  const ttlMs = options.ttlMs ?? DEFAULT_SEED_CONTEXT_TTL_MS;
  let cached: { context: SeedContext; expiresAt: number } | null = null;
  let inFlight: Promise<SeedContext | null> | null = null;
  let failures = 0;
  let blockedUntil = 0;

  function failed(error?: unknown): null {
    failures += 1;
    if (error instanceof ArchiveLimitError || failures >= SEED_CONTEXT_BREAKER_THRESHOLD) {
      blockedUntil = Date.now() + SEED_CONTEXT_BREAKER_COOLDOWN_MS;
      options.log?.warn(
        { repo: options.repo, ref: options.ref, failures, blockedUntil },
        'seed context circuit opened',
      );
    }
    return null;
  }

  async function download(): Promise<SeedContext | null> {
    const archive: GamesRepoArchive = await fetchGamesRepoArchive({
      repo: options.repo,
      ref: options.ref,
      token: options.token,
      include: seedInclude,
      maxTotalBytes: MAX_SEED_CONTEXT_BYTES,
      maxEntryBytes: MAX_SEED_CONTEXT_FILE_BYTES,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });

    // A synchronous index avoids repeated archive reads during prompt generation.
    const paths = archive.listPaths();
    const contents = new Map<string, string>();
    for (const path of paths) {
      const text = await archive.readText(path, options.ref);
      if (text !== null) contents.set(path, text);
    }

    const catalogEntries = options.getCatalog ? await options.getCatalog() : undefined;
    const context = buildSeedContext({ paths, read: (path) => contents.get(path) ?? null }, catalogEntries);
    if (!context) {
      options.log?.warn({ repo: options.repo, ref: options.ref }, 'seed context unusable: no catalog in archive');
      return null;
    }
    options.log?.info(
      { repo: options.repo, ref: options.ref, files: paths.length, bytes: archive.byteCount },
      'seed context loaded',
    );
    return context;
  }

  return {
    async load(): Promise<SeedContext | null> {
      const now = Date.now();
      if (cached && cached.expiresAt > now) return cached.context;
      if (inFlight) return inFlight;
      if (blockedUntil > now) return null;
      if (blockedUntil) {
        blockedUntil = 0;
        failures = 0;
      }

      inFlight = download()
        .then((context) => {
          if (!context) return failed();
          failures = 0;
          cached = { context, expiresAt: Date.now() + ttlMs };
          return context;
        })
        .catch((error: unknown) => {
          options.log?.warn({ err: error, repo: options.repo, ref: options.ref }, 'seed context fetch failed');
          return failed(error);
        })
        .finally(() => {
          inFlight = null;
        });

      return inFlight;
    },
  };
}
