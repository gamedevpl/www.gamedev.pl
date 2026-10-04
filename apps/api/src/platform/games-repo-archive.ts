import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import type { RepoFileSource } from '../catalog/github-client.js';
import { readTarEntries } from './tar.js';

export interface FetchGamesRepoArchiveOptions {
  repo: string;
  ref: string;
  token: string;
  fetchImpl?: typeof fetch;
  /**
   * Which archive paths to keep, relative to the repo root. Defaults to what
   * serving a game needs — everything else in the repo (tools, docs, templates)
   * would only be memory.
   */
  include?: (path: string) => boolean;
  maxTotalBytes?: number;
  maxEntryBytes?: number;
}

export interface GamesRepoArchive extends RepoFileSource {
  /** Files retained from the archive. */
  fileCount: number;
  /** Their total size, for the bake's log line. */
  byteCount: number;
  /**
   * Every retained path, in archive order.
   *
   * `RepoFileSource` can read a path but not discover one, which is enough for the bake
   * (it knows every file it wants from the catalog) and not enough for a caller that has
   * to enumerate a directory — the seed context needs a game's modules without knowing
   * their names. Listing is free here because the archive is already fully in memory.
   */
  listPaths(): string[];
}

/** Sources and media — everything the bake needs to assemble games and derive the catalog. */
function defaultInclude(path: string): boolean {
  // Legacy committed catalog.json is still retained when present so older SHAs
  // keep working; the bake prefers deriving from games/ via listPaths.
  if (path === 'catalog.json' || path.startsWith('shared/')) {
    return true;
  }
  if (!path.startsWith('games/')) {
    return false;
  }
  // Offline review media (~1.8GB) is excluded.
  const mediaIndex = path.indexOf('/media/');
  if (mediaIndex !== -1 && path.indexOf('/', mediaIndex + '/media/'.length) !== -1) {
    return false;
  }
  return true;
}

/**
 * GitHub archives are rooted at `<owner>-<repo>-<sha>/`. Strip that so paths match
 * what the contents API would have been asked for.
 */
function stripRoot(path: string): string | null {
  const slash = path.indexOf('/');
  return slash === -1 ? null : path.slice(slash + 1);
}

export async function fetchGamesRepoArchive(options: FetchGamesRepoArchiveOptions): Promise<GamesRepoArchive> {
  const { repo, ref, token } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const include = options.include ?? defaultInclude;

  const url = `https://api.github.com/repos/${repo}/tarball/${encodeURIComponent(ref)}`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'gamedevpl-games-snapshot-bake',
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`cannot download ${repo}@${ref} archive (${response.status} ${response.statusText})`);
  }

  const files = new Map<string, Uint8Array>();
  let byteCount = 0;

  // The archive is gzipped; gunzip it as it arrives rather than buffering the
  // compressed copy and the decompressed one at once.
  const compressed = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  const gunzipped = compressed.pipe(createGunzip());
  try {
    for await (const entry of readTarEntries(gunzipped, {
      include: (path) => {
        const relative = stripRoot(path);
        return relative !== null && include(relative);
      },
      maxTotalBytes: options.maxTotalBytes,
      maxEntryBytes: options.maxEntryBytes,
    })) {
      const relative = stripRoot(entry.path);
      if (relative === null) {
        continue;
      }
      files.set(relative, entry.bytes);
      byteCount += entry.bytes.byteLength;
    }
  } finally {
    gunzipped.destroy();
    compressed.destroy();
  }

  function assertRef(requested: string): void {
    // The archive is one commit. Serving a different ref from it would quietly
    // answer the wrong question — a PR preview baked from main, say.
    if (requested !== ref) {
      throw new Error(`games-repo archive holds ${ref}, not ${requested}`);
    }
  }

  return {
    fileCount: files.size,
    byteCount,
    listPaths(): string[] {
      return [...files.keys()];
    },
    async readText(path: string, requestedRef: string): Promise<string | null> {
      assertRef(requestedRef);
      const bytes = files.get(path);
      return bytes ? Buffer.from(bytes).toString('utf8') : null;
    },
    async readBytes(path: string, requestedRef: string): Promise<Uint8Array | null> {
      assertRef(requestedRef);
      return files.get(path) ?? null;
    },
  };
}
