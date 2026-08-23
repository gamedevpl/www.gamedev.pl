/**
 * Creator Kit as browsable files for MCP / build-channel agents.
 *
 * `get_kit` still returns a signed tarball URL for agents with shell egress.
 * ChatGPT Apps (and similar) often cannot `curl` that URL from code_execution,
 * and dumping the whole ~1.4MB tree into a tool result would wreck context —
 * so these helpers serve list / search / read / fragment over the same pinned
 * `kits/<engineRef>.tgz` the registry already publishes.
 */

import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';
import { KIT_ENTRY, KIT_ROOT_DIR, KitRegistryError, parseKitRegistry, parseKitSidecar } from './kit-registry.js';
import { isKitEngineRefSupported } from './kit-window.js';
import { readTarEntries } from '../delivery/tar.js';

/** Whole-file reads above this must use fragments instead. */
export const KIT_READ_MAX_BYTES = 48 * 1024;
/** Cap on a single fragment response body. */
export const KIT_FRAGMENT_MAX_BYTES = 32 * 1024;
/** Cap on fragment line counts. */
export const KIT_FRAGMENT_MAX_LINES = 200;
/** Default / hard caps for list. */
export const KIT_LIST_DEFAULT_LIMIT = 200;
export const KIT_LIST_MAX_LIMIT = 500;
/** Cap on search hits returned in one reply. */
export const KIT_SEARCH_MAX_MATCHES = 40;
/** Cap on how many files a search will open (text only). */
export const KIT_SEARCH_MAX_FILES_SCANNED = 400;
/**
 * Batch whole-file reads — enough for a scaffold's small entry files in one model turn,
 * without dumping the kit. Per-file ceiling still applies.
 */
export const KIT_BATCH_MAX_FILES = 12;
/** Aggregate raw-byte budget across a successful batch (not base64-expanded size). */
export const KIT_BATCH_MAX_TOTAL_BYTES = 128 * 1024;
/** Reject absurdly large kit tarballs rather than OOM. */
export const KIT_TREE_MAX_BYTES = 8 * 1024 * 1024;
/** Keep current + previous trees warm (N / N−1 window). */
const KIT_TREE_CACHE_CAPACITY = 2;

const BINARY_EXTENSIONS = new Set([
  '.wav',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tgz',
  '.7z',
  '.bin',
  '.wasm',
  '.mp3',
  '.ogg',
  '.mp4',
  '.webm',
]);

export type KitFileKind = 'text' | 'binary';

export interface KitFileMeta {
  path: string;
  bytes: number;
  kind: KitFileKind;
}

export interface KitTree {
  engineRef: string;
  sha256: string;
  files: Map<string, Buffer>;
}

export class KitFilesError extends Error {
  readonly code:
    | 'kit_store_unavailable'
    | 'kit_registry_missing'
    | 'kit_registry_invalid'
    | 'kit_artifact_missing'
    | 'kit_revision_unsupported'
    | 'kit_path_invalid'
    | 'kit_file_missing'
    | 'kit_file_too_large'
    | 'kit_file_binary'
    | 'kit_query_invalid';

  constructor(code: KitFilesError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KitFilesError';
    this.code = code;
  }
}

export function kitFileKind(path: string, bytes: Buffer): KitFileKind {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot !== -1 && BINARY_EXTENSIONS.has(lower.slice(dot))) {
    return 'binary';
  }
  // NUL in the first 8 KiB → binary (UTF-16 / opaque).
  const probe = bytes.subarray(0, Math.min(bytes.length, 8 * 1024));
  if (probe.includes(0)) return 'binary';
  return 'text';
}

/**
 * Normalize a caller path to the archive member path (`gamedevpl-creator-kit/...`).
 * Accepts either the full member path or a path relative to the kit root.
 */
export function normalizeKitPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed) {
    throw new KitFilesError('kit_path_invalid', 'path is required');
  }
  if (trimmed.startsWith('/') || trimmed.includes('\0')) {
    throw new KitFilesError('kit_path_invalid', 'path must be a relative kit path');
  }
  const parts = trimmed.split('/').filter((part) => part.length > 0 && part !== '.');
  if (parts.some((part) => part === '..')) {
    throw new KitFilesError('kit_path_invalid', 'path must not contain .. segments');
  }
  const joined = parts.join('/');
  if (joined === KIT_ROOT_DIR || joined.startsWith(`${KIT_ROOT_DIR}/`)) {
    return joined;
  }
  return `${KIT_ROOT_DIR}/${joined}`;
}

function matchSimpleGlob(path: string, pattern: string): boolean {
  // Escape regex metacharacters except `*`, which becomes `.*`.
  // `?` must be escaped too — otherwise it is a regex quantifier, not a literal.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(path);
}

/** Coerce a caller-supplied limit/offset; treat NaN/±Infinity as absent. */
function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function listKitFiles(
  tree: KitTree,
  options: { prefix?: string; glob?: string; limit?: number; offset?: number } = {},
): { engineRef: string; entry: string; files: KitFileMeta[]; total: number; truncated: boolean } {
  const limit = Math.min(Math.max(1, finiteOrUndefined(options.limit) ?? KIT_LIST_DEFAULT_LIMIT), KIT_LIST_MAX_LIMIT);
  const offset = Math.max(0, finiteOrUndefined(options.offset) ?? 0);
  const prefix = options.prefix?.trim() ? normalizeKitPath(options.prefix) : '';
  const glob = options.glob?.trim() ?? '';

  const all: KitFileMeta[] = [];
  for (const [path, bytes] of tree.files) {
    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    if (glob) {
      const relative = path.startsWith(`${KIT_ROOT_DIR}/`) ? path.slice(KIT_ROOT_DIR.length + 1) : path;
      if (!matchSimpleGlob(path, glob) && !matchSimpleGlob(relative, glob)) continue;
    }
    all.push({ path, bytes: bytes.length, kind: kitFileKind(path, bytes) });
  }
  all.sort((a, b) => a.path.localeCompare(b.path));
  const slice = all.slice(offset, offset + limit);
  return {
    engineRef: tree.engineRef,
    entry: KIT_ENTRY,
    files: slice,
    total: all.length,
    truncated: offset + slice.length < all.length,
  };
}

export function searchKitFiles(
  tree: KitTree,
  options: { query: string; prefix?: string; limit?: number },
): {
  engineRef: string;
  query: string;
  matches: Array<{ path: string; line: number; text: string }>;
  truncated: boolean;
  filesScanned: number;
} {
  const query = options.query.trim();
  if (query.length < 2 || query.length > 120) {
    throw new KitFilesError('kit_query_invalid', 'query must be 2–120 characters');
  }
  const limit = Math.min(
    Math.max(1, finiteOrUndefined(options.limit) ?? KIT_SEARCH_MAX_MATCHES),
    KIT_SEARCH_MAX_MATCHES,
  );
  let prefix = '';
  if (options.prefix?.trim()) {
    prefix = normalizeKitPath(options.prefix);
  }
  const needle = query.toLowerCase();
  const matches: Array<{ path: string; line: number; text: string }> = [];
  let filesScanned = 0;
  let truncated = false;

  const paths = [...tree.files.keys()].sort((a, b) => a.localeCompare(b));
  for (const path of paths) {
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    const bytes = tree.files.get(path)!;
    if (kitFileKind(path, bytes) !== 'text') continue;
    if (filesScanned >= KIT_SEARCH_MAX_FILES_SCANNED) {
      truncated = true;
      break;
    }
    filesScanned += 1;
    const text = bytes.toString('utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (matches.length >= limit) {
        truncated = true;
        break;
      }
      const line = lines[i];
      if (!line.toLowerCase().includes(needle)) continue;
      const clipped = line.length > 240 ? `${line.slice(0, 240)}…` : line;
      matches.push({ path, line: i + 1, text: clipped });
    }
  }

  return { engineRef: tree.engineRef, query, matches, truncated, filesScanned };
}

export type KitFileReadResult = {
  engineRef: string;
  path: string;
  bytes: number;
  kind: KitFileKind;
  encoding: 'utf8' | 'base64';
  content: string;
};

export type KitBatchFileResult =
  | ({ ok: true } & Omit<KitFileReadResult, 'engineRef'>)
  | { ok: false; path: string; error: KitFilesError['code'] | 'kit_batch_budget'; message: string };

export function readKitFile(
  tree: KitTree,
  rawPath: string,
  options: { encoding?: 'utf8' | 'base64' } = {},
): KitFileReadResult {
  const path = normalizeKitPath(rawPath);
  const bytes = tree.files.get(path);
  if (!bytes) {
    throw new KitFilesError('kit_file_missing', `no kit file at ${path}`);
  }
  const kind = kitFileKind(path, bytes);
  const encoding = options.encoding ?? (kind === 'binary' ? 'base64' : 'utf8');
  if (kind === 'binary' && encoding !== 'base64') {
    throw new KitFilesError(
      'kit_file_binary',
      `${path} is binary — pass encoding=base64, or use a fragment with encoding=base64`,
    );
  }
  if (bytes.length > KIT_READ_MAX_BYTES) {
    throw new KitFilesError(
      'kit_file_too_large',
      `${path} is ${bytes.length} bytes (max ${KIT_READ_MAX_BYTES} for read_kit_file) — use read_kit_file_fragment`,
    );
  }
  return {
    engineRef: tree.engineRef,
    path,
    bytes: bytes.length,
    kind,
    encoding,
    content: encoding === 'base64' ? bytes.toString('base64') : bytes.toString('utf8'),
  };
}

/**
 * Read several small kit files in one call (order preserved). Per-path failures stay in
 * the result list; whole-call auth / tree load errors still throw from the store.
 */
export function readKitFiles(
  tree: KitTree,
  rawPaths: string[],
  options: { encoding?: 'utf8' | 'base64' } = {},
): {
  engineRef: string;
  files: KitBatchFileResult[];
  totalBytes: number;
  maxBytes: number;
  maxFiles: number;
  truncated: boolean;
} {
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    throw new KitFilesError('kit_query_invalid', 'paths must be a non-empty array');
  }
  const truncated = rawPaths.length > KIT_BATCH_MAX_FILES;
  const paths = rawPaths.slice(0, KIT_BATCH_MAX_FILES);
  const files: KitBatchFileResult[] = [];
  let totalBytes = 0;

  for (const rawPath of paths) {
    const displayPath = typeof rawPath === 'string' ? rawPath.trim() : '';
    try {
      const read = readKitFile(tree, displayPath, options);
      if (totalBytes + read.bytes > KIT_BATCH_MAX_TOTAL_BYTES) {
        files.push({
          ok: false,
          path: read.path,
          error: 'kit_batch_budget',
          message: `batch would exceed ${KIT_BATCH_MAX_TOTAL_BYTES} bytes (already ${totalBytes}); use read_kit_file / fragment for the rest`,
        });
        continue;
      }
      totalBytes += read.bytes;
      files.push({
        ok: true,
        path: read.path,
        bytes: read.bytes,
        kind: read.kind,
        encoding: read.encoding,
        content: read.content,
      });
    } catch (error) {
      if (error instanceof KitFilesError) {
        let path = displayPath || '(empty)';
        try {
          if (displayPath) path = normalizeKitPath(displayPath);
        } catch {
          // keep displayPath
        }
        files.push({ ok: false, path, error: error.code, message: error.message });
        continue;
      }
      throw error;
    }
  }

  return {
    engineRef: tree.engineRef,
    files,
    totalBytes,
    maxBytes: KIT_BATCH_MAX_TOTAL_BYTES,
    maxFiles: KIT_BATCH_MAX_FILES,
    truncated,
  };
}

export function readKitFileFragment(
  tree: KitTree,
  rawPath: string,
  options: {
    offset?: number;
    limit?: number;
    unit?: 'bytes' | 'lines';
    encoding?: 'utf8' | 'base64';
  } = {},
): {
  engineRef: string;
  path: string;
  kind: KitFileKind;
  unit: 'bytes' | 'lines';
  offset: number;
  limit: number;
  totalBytes: number;
  totalLines: number | null;
  encoding: 'utf8' | 'base64';
  content: string;
  eof: boolean;
  /** Pass as the next call's offset; null at EOF. */
  nextOffset: number | null;
} {
  const path = normalizeKitPath(rawPath);
  const bytes = tree.files.get(path);
  if (!bytes) {
    throw new KitFilesError('kit_file_missing', `no kit file at ${path}`);
  }
  const kind = kitFileKind(path, bytes);
  const unit = options.unit ?? 'lines';
  const offset = Math.max(0, finiteOrUndefined(options.offset) ?? 0);
  // Byte windows are opaque slices — always base64 so multi-byte UTF-8 (Polish, emoji)
  // is never split across fragments. Line mode is the text path.
  const encoding = options.encoding ?? (unit === 'bytes' || kind === 'binary' ? 'base64' : 'utf8');

  if (kind === 'binary' && encoding !== 'base64') {
    throw new KitFilesError('kit_file_binary', `${path} is binary — pass encoding=base64`);
  }
  if (kind === 'binary' && unit === 'lines') {
    throw new KitFilesError('kit_query_invalid', 'binary files only support unit=bytes');
  }
  if (unit === 'bytes' && encoding !== 'base64') {
    throw new KitFilesError(
      'kit_query_invalid',
      'unit=bytes requires encoding=base64 (utf8 would split multi-byte characters at fragment boundaries)',
    );
  }

  if (unit === 'bytes') {
    const limit = Math.min(
      Math.max(1, finiteOrUndefined(options.limit) ?? KIT_FRAGMENT_MAX_BYTES),
      KIT_FRAGMENT_MAX_BYTES,
    );
    if (offset > bytes.length) {
      throw new KitFilesError('kit_query_invalid', `offset ${offset} is past end of file (${bytes.length} bytes)`);
    }
    const slice = bytes.subarray(offset, offset + limit);
    return {
      engineRef: tree.engineRef,
      path,
      kind,
      unit,
      offset,
      limit,
      totalBytes: bytes.length,
      totalLines: null,
      encoding: 'base64',
      content: Buffer.from(slice).toString('base64'),
      eof: offset + slice.length >= bytes.length,
      nextOffset: offset + slice.length >= bytes.length ? null : offset + slice.length,
    };
  }

  const text = bytes.toString('utf8');
  const lines = text.split(/\r?\n/);
  const limit = Math.min(Math.max(1, finiteOrUndefined(options.limit) ?? 80), KIT_FRAGMENT_MAX_LINES);
  if (offset > lines.length) {
    throw new KitFilesError('kit_query_invalid', `offset ${offset} is past end of file (${lines.length} lines)`);
  }
  const slice = lines.slice(offset, offset + limit);
  // Re-join without inventing a trailing newline the source did not have at EOF…
  // but keep interior newlines. For fragments, a trailing `\n` between lines is fine.
  const content = slice.join('\n');
  if (Buffer.byteLength(content, 'utf8') > KIT_FRAGMENT_MAX_BYTES) {
    // Do not silently drop the remainder of an overlong line — that would skip bytes
    // on the next line-mode page. Callers must switch to byte mode.
    throw new KitFilesError(
      'kit_query_invalid',
      `line window at offset ${offset} exceeds ${KIT_FRAGMENT_MAX_BYTES} bytes — use unit=bytes with encoding=base64`,
    );
  }
  const eof = offset + slice.length >= lines.length;
  return {
    engineRef: tree.engineRef,
    path,
    kind,
    unit,
    offset,
    limit,
    totalBytes: bytes.length,
    totalLines: lines.length,
    encoding: 'utf8',
    content,
    eof,
    nextOffset: eof ? null : offset + slice.length,
  };
}

async function unpackKitTarball(tarball: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const gunzipped = Readable.from(tarball).pipe(createGunzip());
  for await (const entry of readTarEntries(gunzipped, { maxTotalBytes: KIT_TREE_MAX_BYTES })) {
    // Skip oddities outside the kit root (shouldn't appear in a packed kit).
    if (entry.path !== KIT_ROOT_DIR && !entry.path.startsWith(`${KIT_ROOT_DIR}/`)) {
      continue;
    }
    files.set(entry.path, Buffer.from(entry.bytes));
  }
  if (files.size === 0) {
    throw new KitFilesError('kit_artifact_missing', 'kit tarball contained no files under the kit root');
  }
  return files;
}

export interface KitFileStore {
  /** Metadata for the current registry entry — does not unpack. */
  loadRegistry(): Promise<{ engineRef: string; previous: string | null; sha256: string }>;
  /**
   * Unpack (or return cached) tree for a kit revision.
   * When `engineRef` is omitted, uses `kits/current.json.current`.
   * When provided, must be current or previous (N / N−1) — pins a browse session
   * so a mid-round registry bump cannot mix files from two kits.
   */
  loadTree(engineRef?: string): Promise<KitTree>;
  /** @deprecated Prefer {@link loadTree}; alias for `loadTree()`. */
  loadCurrentTree(): Promise<KitTree>;
}

export function createKitFileStore(objectStore: GcsObjectStore): KitFileStore {
  const cache = new Map<string, KitTree>();

  function remember(tree: KitTree): KitTree {
    cache.set(tree.engineRef, tree);
    while (cache.size > KIT_TREE_CACHE_CAPACITY) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined || oldest === tree.engineRef) break;
      cache.delete(oldest);
    }
    return tree;
  }

  async function readWindow(): Promise<{ current: string; previous: string | null; currentVersion?: string }> {
    const registryBody = await objectStore.readObject('kits/current.json');
    if (!registryBody) {
      throw new KitFilesError(
        'kit_registry_missing',
        'kits/current.json is not published yet — the games-repo kit publisher has not run',
      );
    }
    try {
      const registry = parseKitRegistry(registryBody.toString('utf8'));
      return {
        current: registry.current,
        previous: registry.previous,
        ...(registry.currentVersion ? { currentVersion: registry.currentVersion } : {}),
      };
    } catch (error) {
      if (error instanceof KitRegistryError) {
        throw new KitFilesError(error.code, error.message, { cause: error });
      }
      throw error;
    }
  }

  async function loadSidecar(engineRef: string): Promise<string> {
    const sidecarBody = await objectStore.readObject(`kits/${engineRef}.json`);
    if (!sidecarBody) {
      throw new KitFilesError(
        'kit_artifact_missing',
        `kits/${engineRef}.json sidecar is missing for the current registry entry`,
      );
    }
    try {
      return parseKitSidecar(sidecarBody.toString('utf8')).sha256;
    } catch (error) {
      if (error instanceof KitRegistryError) {
        throw new KitFilesError(error.code, error.message, { cause: error });
      }
      throw error;
    }
  }

  async function loadRegistry(): Promise<{ engineRef: string; previous: string | null; sha256: string }> {
    const window = await readWindow();
    const sha256 = await loadSidecar(window.current);
    return { engineRef: window.current, previous: window.previous, sha256 };
  }

  /**
   * The semver a kit was packed at, or null when it cannot be read.
   *
   * Null is the safe answer everywhere it is used: it drops the caller back to the
   * N/N−1 floor rather than granting a compatibility claim the sidecar never made.
   */
  async function loadSidecarVersion(engineRef: string): Promise<string | null> {
    const sidecarBody = await objectStore.readObject(`kits/${engineRef}.json`);
    if (!sidecarBody) return null;
    try {
      return parseKitSidecar(sidecarBody.toString('utf8')).version ?? null;
    } catch {
      return null;
    }
  }

  async function loadTree(engineRef?: string): Promise<KitTree> {
    const window = await readWindow();
    const requested = engineRef?.trim() || window.current;
    // Same window as the gate, deliberately.
    //
    // Browsing used to enforce N/N−1 on its own, which put an agent in the position of
    // being unable to *read* the kit it is building against while the gate would still
    // accept the delivery — and the only way out was to re-fetch the kit mid-round,
    // which is exactly the churn the semver window exists to stop. Read and verdict
    // have to agree about which kits are alive.
    const sidecarVersion =
      requested !== window.current && requested !== window.previous && window.currentVersion
        ? await loadSidecarVersion(requested)
        : null;
    const supported = isKitEngineRefSupported(
      requested,
      {
        current: window.current,
        previous: window.previous,
        ...(window.currentVersion ? { currentVersion: window.currentVersion } : {}),
        // Not read by the window rule; the registry document's own timestamp is
        // irrelevant to whether a ref is compatible.
        updatedAt: '',
      },
      sidecarVersion,
    );
    if (!supported) {
      throw new KitFilesError(
        'kit_revision_unsupported',
        `engineRef ${requested} is outside the supported window (` +
          (window.currentVersion
            ? `current kit is v${window.currentVersion}; reads must share its major version`
            : `current=${window.current}` + (window.previous ? `, previous=${window.previous}` : '')) +
          ') — re-run get_kit',
      );
    }
    const sha256 = await loadSidecar(requested);
    const cached = cache.get(requested);
    if (cached && cached.sha256 === sha256) {
      return cached;
    }
    const tarball = await objectStore.readObject(`kits/${requested}.tgz`);
    if (!tarball) {
      throw new KitFilesError(
        'kit_artifact_missing',
        `kits/${requested}.tgz is missing for the requested registry entry`,
      );
    }
    const files = await unpackKitTarball(tarball);
    return remember({ engineRef: requested, sha256, files });
  }

  return {
    loadRegistry,
    loadTree,
    loadCurrentTree: () => loadTree(),
  };
}
