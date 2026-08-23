/**
 * Exemplar sources as browsable files for MCP / build-channel agents.
 *
 * The sibling of `kit-files.ts`, for the same reason and against the same finding:
 * `get_example` hands back a signed tarball and a `curl … | tar -xz` line, which
 * assumes the reader can open a socket. A ChatGPT-side connector cannot — it calls
 * MCP tools and nothing else (owner test, 2026-08-03) — so for that agent the
 * curated exemplars, the one piece of "here is how a good game is written" context
 * we offer, were unreachable. This serves list / read over the same
 * `examples/<slug>.tgz` the publisher already writes.
 *
 * Narrower than the kit deliberately. A kit is a whole toolchain (~1.4 MB, hundreds
 * of files) and needs search and fragments to be navigable; an exemplar is one game
 * directory — a spec, a handful of modules, some JSON — so list + read covers it,
 * and a caller that wants to grep can list and read. Members are rooted at
 * `games/<slug>/` (games-repo `pack-example.ts`), not at a kit root.
 */

import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { GcsObjectStore } from './delivery/gcs-sign.js';
import { kitFileKind, type KitFileKind } from './agent-surface/kit-files.js';
import { readTarEntries } from './delivery/tar.js';

/** Whole-file reads above this are refused — an exemplar module is never this big. */
export const EXAMPLE_READ_MAX_BYTES = 64 * 1024;
/** Default / hard caps for list. */
export const EXAMPLE_LIST_DEFAULT_LIMIT = 200;
export const EXAMPLE_LIST_MAX_LIMIT = 500;
/** Reject an absurdly large exemplar tarball rather than OOM. */
export const EXAMPLE_TREE_MAX_BYTES = 4 * 1024 * 1024;
/** Exemplars are small and re-read across a round; keep a few warm. */
const EXAMPLE_TREE_CACHE_CAPACITY = 3;

export class ExampleFilesError extends Error {
  readonly code:
    | 'example_store_unavailable'
    | 'example_unavailable'
    | 'example_path_invalid'
    | 'example_file_missing'
    | 'example_file_too_large'
    | 'example_file_binary'
    | 'example_query_invalid';

  constructor(code: ExampleFilesError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
    this.name = 'ExampleFilesError';
  }
}

export interface ExampleFileMeta {
  path: string;
  bytes: number;
  kind: KitFileKind;
}

export interface ExampleTree {
  slug: string;
  /** Keyed by full member path (`games/<slug>/…`). */
  files: Map<string, Buffer>;
}

/** The archive root for one exemplar, matching the games-repo packer. */
export function exampleRootDir(slug: string): string {
  return `games/${slug}`;
}

/**
 * Resolve a caller-supplied path against the exemplar root.
 *
 * Accepts both `game.ts` and `games/<slug>/game.ts` so an agent that pasted a path
 * out of a list reply gets the same file as one that typed a relative name. Traversal
 * is refused rather than normalized away: `..` in a path handed to us by an untrusted
 * round is a probe, not a typo.
 */
export function normalizeExamplePath(slug: string, raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/^\.\//, '');
  if (!trimmed) {
    throw new ExampleFilesError('example_path_invalid', 'path is required');
  }
  if (trimmed.startsWith('/') || trimmed.includes('\\')) {
    throw new ExampleFilesError('example_path_invalid', `invalid path: ${raw}`);
  }
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new ExampleFilesError('example_path_invalid', `invalid path: ${raw}`);
  }
  const root = exampleRootDir(slug);
  if (trimmed === root || trimmed.startsWith(`${root}/`)) return trimmed;
  return `${root}/${trimmed}`;
}

export function listExampleFiles(
  tree: ExampleTree,
  options: { prefix?: string; limit?: number; offset?: number } = {},
): { slug: string; files: ExampleFileMeta[]; total: number; truncated: boolean } {
  const limit = Math.min(
    Math.max(1, Number.isFinite(options.limit) ? (options.limit as number) : EXAMPLE_LIST_DEFAULT_LIMIT),
    EXAMPLE_LIST_MAX_LIMIT,
  );
  const offset = Math.max(0, Number.isFinite(options.offset) ? (options.offset as number) : 0);
  const prefix = options.prefix?.trim() ? normalizeExamplePath(tree.slug, options.prefix) : '';

  const all: ExampleFileMeta[] = [];
  for (const [path, bytes] of tree.files) {
    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    all.push({ path, bytes: bytes.length, kind: kitFileKind(path, bytes) });
  }
  all.sort((a, b) => a.path.localeCompare(b.path));
  const slice = all.slice(offset, offset + limit);
  return {
    slug: tree.slug,
    files: slice,
    total: all.length,
    // Said rather than implied: a caller that believes it listed everything will
    // reason about an exemplar it has only partly seen.
    truncated: offset + slice.length < all.length,
  };
}

export function readExampleFile(
  tree: ExampleTree,
  rawPath: string,
  options: { encoding?: 'utf8' | 'base64' } = {},
): { slug: string; path: string; bytes: number; kind: KitFileKind; encoding: 'utf8' | 'base64'; content: string } {
  const path = normalizeExamplePath(tree.slug, rawPath);
  const bytes = tree.files.get(path);
  if (!bytes) {
    throw new ExampleFilesError('example_file_missing', `no file at ${path} in exemplar ${tree.slug}`);
  }
  const kind = kitFileKind(path, bytes);
  const encoding = options.encoding ?? (kind === 'binary' ? 'base64' : 'utf8');
  if (kind === 'binary' && encoding !== 'base64') {
    throw new ExampleFilesError('example_file_binary', `${path} is binary — pass encoding=base64`);
  }
  if (bytes.length > EXAMPLE_READ_MAX_BYTES) {
    throw new ExampleFilesError(
      'example_file_too_large',
      `${path} is ${bytes.length} bytes (max ${EXAMPLE_READ_MAX_BYTES}) — read a smaller file`,
    );
  }
  return {
    slug: tree.slug,
    path,
    bytes: bytes.length,
    kind,
    encoding,
    content: encoding === 'base64' ? bytes.toString('base64') : bytes.toString('utf8'),
  };
}

async function unpackExampleTarball(slug: string, tarball: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const root = exampleRootDir(slug);
  const gunzipped = Readable.from(tarball).pipe(createGunzip());
  for await (const entry of readTarEntries(gunzipped, { maxTotalBytes: EXAMPLE_TREE_MAX_BYTES })) {
    // Anything outside this exemplar's own directory is dropped. The packer should
    // never produce such a member; if a future one does, it must not become readable
    // through a tool scoped to one slug.
    if (entry.path !== root && !entry.path.startsWith(`${root}/`)) continue;
    files.set(entry.path, Buffer.from(entry.bytes));
  }
  if (files.size === 0) {
    throw new ExampleFilesError('example_unavailable', `exemplar ${slug} contained no files under ${root}`);
  }
  return files;
}

export interface ExampleFileStore {
  loadTree(slug: string): Promise<ExampleTree>;
}

export function createExampleFileStore(objectStore: GcsObjectStore): ExampleFileStore {
  const cache = new Map<string, ExampleTree>();

  function remember(tree: ExampleTree): ExampleTree {
    cache.set(tree.slug, tree);
    while (cache.size > EXAMPLE_TREE_CACHE_CAPACITY) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined || oldest === tree.slug) break;
      cache.delete(oldest);
    }
    return tree;
  }

  return {
    async loadTree(slug) {
      const cached = cache.get(slug);
      if (cached) return cached;
      const body = await objectStore.readObject(`examples/${slug}.tgz`);
      if (!body) {
        throw new ExampleFilesError('example_unavailable', `no packed sources for exemplar ${slug}`);
      }
      return remember({ slug, files: await unpackExampleTarball(slug, body) });
    },
  };
}
