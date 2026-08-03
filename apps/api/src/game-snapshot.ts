import { GoogleAuth } from 'google-auth-library';
import type { CatalogGameEntry } from './github-client.js';

/**
 * Published games as immutable, pre-assembled objects in Cloud Storage.
 *
 * Until now every play of a published game rebuilt it from scratch on the request
 * path: a fan-out of authenticated GitHub reads for the game's sources and the
 * GameKit modules it selects, an esbuild bundle, then assembly. That made GitHub
 * API availability and quota a hard dependency of the *play* route — the one route
 * that must never be down — and it had already cost one rate-limit outage (the
 * reason `getCatalog` moved to batched GraphQL, see github-client.ts).
 *
 * The work is the same either way; the question is only whether it happens once per
 * merge or once per cache miss per instance. This module makes it once per merge:
 * `publishSnapshot` bakes every published game into a self-contained document and
 * writes it here, and the serve routes read the result.
 *
 * ## Layout
 *
 *   current.json                              → the pointer (small, mutable)
 *   snapshots/<id>/catalog.json               → CatalogGameEntry[]
 *   snapshots/<id>/games/<slug>.json          → { slug, title, html }
 *   snapshots/<id>/media/<slug>/<filename>    → screenshot / video bytes
 *   snapshots/<id>/media/<slug>/w<width>/<f>  → downscaled screenshot (see image-variants)
 *
 * Snapshot prefixes are immutable and content-addressed by publish; only
 * `current.json` is ever overwritten. Three things fall out of that:
 * publishing is atomic (a half-uploaded snapshot is invisible until the pointer
 * moves), rollback is a pointer rewrite rather than a rebuild, and every object
 * under `snapshots/` is safe to cache forever — so putting a CDN in front later
 * is a configuration change, not a redesign.
 */

/** Points at the snapshot the site should currently serve. */
export interface SnapshotPointer {
  snapshotId: string;
  /** Games-repo commit the snapshot was baked from, for traceability. */
  commitSha: string | null;
  publishedAt: string;
  gameCount: number;
}

/** A pre-assembled game, shaped exactly like the play route's response body. */
export interface SnapshotGame {
  slug: string;
  title: string;
  html: string;
}

export interface SnapshotMedia {
  body: Buffer;
  contentType: string;
}

/**
 * The snapshot is configured but cannot answer the request: no `current.json`,
 * an empty pointer, or a Storage / transport failure. Published serve routes map
 * this to 503 and must not assemble from GitHub.
 */
export class SnapshotUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotUnavailableError';
  }
}

/**
 * The snapshot catalog says the game (or media) is published, but the baked
 * object is missing — a bake inconsistency. Published serve routes map this to
 * 502 and must not assemble from GitHub.
 */
export class SnapshotIncompleteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SnapshotIncompleteError';
  }
}

/**
 * The read side, used by the serve routes. Every method throws on transport
 * failure and resolves to null on a genuine miss, so callers can tell "snapshot
 * is unreachable" apart from "this object is not in the current snapshot".
 * When a reader is configured, published routes treat either outcome as a hard
 * failure — they do not fall back to GitHub.
 */
export interface GameSnapshotReader {
  getPointer(): Promise<SnapshotPointer | null>;
  getCatalog(): Promise<CatalogGameEntry[] | null>;
  getGame(slug: string): Promise<SnapshotGame | null>;
  /**
   * `width` asks for a baked size variant. Callers must treat a null as "serve the
   * original": snapshots baked before variants existed have none, and a bake that
   * could not read one PNG skips only that variant.
   */
  getMedia(slug: string, filename: string, width?: number): Promise<SnapshotMedia | null>;
}

/** The write side, used by the publish job. */
export interface GameSnapshotWriter {
  putCatalog(snapshotId: string, entries: CatalogGameEntry[]): Promise<void>;
  putGame(snapshotId: string, game: SnapshotGame): Promise<void>;
  putMedia(snapshotId: string, slug: string, filename: string, media: SnapshotMedia, width?: number): Promise<void>;
  putPointer(pointer: SnapshotPointer): Promise<void>;
}

export type GameSnapshotStore = GameSnapshotReader & GameSnapshotWriter;

export const POINTER_OBJECT = 'current.json';

export function catalogObject(snapshotId: string): string {
  return `snapshots/${snapshotId}/catalog.json`;
}

export function gameObject(snapshotId: string, slug: string): string {
  return `snapshots/${snapshotId}/games/${slug}.json`;
}

export function mediaObject(snapshotId: string, slug: string, filename: string, width?: number): string {
  // Variants live in their own directory rather than behind a filename suffix: the
  // filename is validated against the game's own catalog entry, and inventing
  // `opening-96.png` would put a synthetic name into a space real screenshots occupy.
  const prefix = `snapshots/${snapshotId}/media/${slug}`;
  return width === undefined ? `${prefix}/${filename}` : `${prefix}/w${width}/${filename}`;
}

export function mediaContentType(filename: string): string {
  return filename.endsWith('.mp4') ? 'video/mp4' : 'image/png';
}

/**
 * Snapshot ids sort lexicographically in publish order, so listing the bucket
 * shows history newest-last and old snapshots are trivially identifiable for
 * lifecycle deletion. The random suffix keeps two publishes in the same second
 * from colliding.
 */
export function generateSnapshotId(now: Date, random: () => number = Math.random): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const suffix = Math.floor(random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
  return `${stamp}-${suffix}`;
}

/** Rejects anything that could escape its prefix or forge an object path. */
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_MEDIA_FILENAME = /^[a-z0-9][a-z0-9-]*\.(?:png|mp4)$/;
const SAFE_SNAPSHOT_ID = /^[0-9A-Za-z-]+$/;

function assertSafeSlug(slug: string): void {
  if (!SAFE_SLUG.test(slug)) throw new Error(`unsafe slug "${slug}"`);
}

function assertSafeMediaFilename(filename: string): void {
  if (!SAFE_MEDIA_FILENAME.test(filename)) throw new Error(`unsafe media filename "${filename}"`);
}

function assertSafeSnapshotId(snapshotId: string): void {
  if (!SAFE_SNAPSHOT_ID.test(snapshotId)) throw new Error(`unsafe snapshot id "${snapshotId}"`);
}

export interface GcsSnapshotStoreOptions {
  bucket: string;
  fetchImpl?: typeof fetch;
  /**
   * Resolves a bearer token for the Storage JSON API. Defaults to Application
   * Default Credentials, which on Cloud Run is the service account already
   * attached to the revision — no key material anywhere.
   */
  getAccessToken?: () => Promise<string>;
  /** How long a resolved pointer is trusted before re-reading it. */
  pointerTtlMs?: number;
  /**
   * Deadline on a single snapshot *read*, including the token fetch and the body.
   *
   * Published catalog and play read Cloud Storage with nothing behind it: a *failed*
   * connection degrades to a fast 503, but a *hung* one had no deadline at all, so it
   * stalled the play route — the one route that must never be down — for as long as
   * the socket stayed open. A timeout raises `SnapshotUnavailableError`, which is the
   * same error a transport failure already produces, so a hang and a refusal are
   * indistinguishable to callers: both are a quick 503, and an already-resolved
   * pointer keeps being served.
   *
   * Reads only. Writes are deliberately left untimed — `putGame` uploads a whole
   * assembled game and the bake job pushes the entire catalog through it, so a
   * few-second ceiling there would fail large games for no operational gain. The
   * bake is a batch job with its own wall-clock limit; the play route is not.
   */
  readTimeoutMs?: number;
  now?: () => number;
}

/**
 * We talk to the Storage JSON API over `fetch` with an ADC bearer token rather
 * than pulling in `@google-cloud/storage`. The API surface we need is three verbs,
 * the auth library is already a dependency (it backs Google sign-in), and keeping
 * the transport at the `fetch` boundary means tests fake it the same way
 * local-games-repo.ts fakes GitHub — no second client implementation to keep honest.
 */
export function createGcsSnapshotStore(options: GcsSnapshotStoreOptions): GameSnapshotStore {
  const { bucket } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const pointerTtlMs = options.pointerTtlMs ?? 60_000;
  // Long enough that a healthy read never trips it (Storage in-region answers in tens
  // of milliseconds), short enough that a visitor waiting on a wedged connection gets
  // an answer instead of a spinner.
  const readTimeoutMs = options.readTimeoutMs ?? 3_000;

  let auth: GoogleAuth | null = null;
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token for the snapshot bucket');
      return token;
    });

  async function authHeaders(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await getAccessToken()}` };
  }

  /**
   * Runs a read under `readTimeoutMs`, aborting the request when it expires.
   *
   * Raced rather than left to the `AbortSignal` alone: aborting is what frees the
   * socket, but the *guarantee* the play route needs is that this settles by the
   * deadline whatever the transport does with the signal. The rejection is a
   * `SnapshotUnavailableError` so a hang lands on the existing degradation path
   * rather than on a new one.
   */
  async function withReadDeadline<T>(name: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SnapshotUnavailableError(`snapshot read of ${name} timed out after ${readTimeoutMs}ms`));
      }, readTimeoutMs);
    });

    const attempt = run(controller.signal);
    // The loser of the race still settles. Once we have abandoned it, its abort
    // rejection is expected — claim it here so it is not an unhandled rejection.
    attempt.catch(() => {});

    try {
      return await Promise.race([attempt, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function readObject(name: string): Promise<Buffer | null> {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`;
    // The token fetch and the body read are inside the deadline with the request: both
    // are network calls (the first to the metadata server), and either can be the thing
    // that hangs.
    return withReadDeadline(name, async (signal) => {
      const response = await fetchImpl(url, { headers: await authHeaders(), signal });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`snapshot read of ${name} failed: ${response.status} ${await safeBodyText(response)}`);
      }
      return Buffer.from(await response.arrayBuffer());
    });
  }

  async function readJson<T>(name: string): Promise<T | null> {
    const body = await readObject(name);
    if (!body) return null;
    try {
      return JSON.parse(body.toString('utf8')) as T;
    } catch (error) {
      throw new Error(`snapshot object ${name} is not valid JSON`, { cause: error });
    }
  }

  // Untimed on purpose — see readTimeoutMs. This carries whole assembled games for a
  // batch job, not a request a person is waiting on.
  async function writeObject(name: string, body: Buffer, contentType: string, cacheControl: string): Promise<void> {
    const url =
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(name)}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        ...(await authHeaders()),
        'content-type': contentType,
        'cache-control': cacheControl,
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      throw new Error(`snapshot write of ${name} failed: ${response.status} ${await safeBodyText(response)}`);
    }
  }

  // Objects under snapshots/ never change, so they are safe to cache hard —
  // this is what a CDN in front of the bucket would honour. The pointer is the
  // one mutable object and must not be cached, or a publish would take an
  // unbounded time to become visible.
  const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
  const POINTER_CACHE = 'no-cache';

  let pointerCache: { value: SnapshotPointer | null; expiresAt: number } | null = null;
  let pointerRefresh: Promise<SnapshotPointer | null> | null = null;

  return {
    async getPointer() {
      if (pointerCache && pointerCache.expiresAt > now()) {
        return pointerCache.value;
      }
      // Misses coalesce: a cold instance takes a page load's worth of catalog,
      // game and media requests at once, and they all need the same pointer.
      pointerRefresh ??= readJson<SnapshotPointer>(POINTER_OBJECT)
        .then((value) => {
          pointerCache = { value, expiresAt: now() + pointerTtlMs };
          return value;
        })
        .finally(() => {
          pointerRefresh = null;
        });
      try {
        return await pointerRefresh;
      } catch (error) {
        // A pointer we already resolved stays usable: snapshot objects are
        // immutable, so a stale pointer serves correct (if not newest) games.
        if (pointerCache) return pointerCache.value;
        throw error;
      }
    },

    async getCatalog() {
      const pointer = await this.getPointer();
      if (!pointer) return null;
      return readJson<CatalogGameEntry[]>(catalogObject(pointer.snapshotId));
    },

    async getGame(slug) {
      assertSafeSlug(slug);
      const pointer = await this.getPointer();
      if (!pointer) return null;
      return readJson<SnapshotGame>(gameObject(pointer.snapshotId, slug));
    },

    async getMedia(slug, filename, width) {
      assertSafeSlug(slug);
      assertSafeMediaFilename(filename);
      const pointer = await this.getPointer();
      if (!pointer) return null;
      const body = await readObject(mediaObject(pointer.snapshotId, slug, filename, width));
      if (!body) return null;
      return { body, contentType: mediaContentType(filename) };
    },

    async putCatalog(snapshotId, entries) {
      assertSafeSnapshotId(snapshotId);
      await writeObject(
        catalogObject(snapshotId),
        Buffer.from(JSON.stringify(entries), 'utf8'),
        'application/json',
        IMMUTABLE_CACHE,
      );
    },

    async putGame(snapshotId, game) {
      assertSafeSnapshotId(snapshotId);
      assertSafeSlug(game.slug);
      await writeObject(
        gameObject(snapshotId, game.slug),
        Buffer.from(JSON.stringify(game), 'utf8'),
        'application/json',
        IMMUTABLE_CACHE,
      );
    },

    async putMedia(snapshotId, slug, filename, media, width) {
      assertSafeSnapshotId(snapshotId);
      assertSafeSlug(slug);
      assertSafeMediaFilename(filename);
      await writeObject(mediaObject(snapshotId, slug, filename, width), media.body, media.contentType, IMMUTABLE_CACHE);
    },

    async putPointer(pointer) {
      assertSafeSnapshotId(pointer.snapshotId);
      await writeObject(
        POINTER_OBJECT,
        Buffer.from(JSON.stringify(pointer), 'utf8'),
        'application/json',
        POINTER_CACHE,
      );
      pointerCache = { value: pointer, expiresAt: now() + pointerTtlMs };
    },
  };
}

async function safeBodyText(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * Builds the reader the serve routes use, or null when no bucket is configured.
 *
 * Absent configuration is a supported opt-out, not a fallback from a configured
 * bucket: local development, fixtures, and `local-games-repo` leave
 * `GAMES_SNAPSHOT_BUCKET` unset and serve from GitHub / the local tree. When the
 * env var is set, published catalog / play / media routes require the snapshot.
 */
export function createSnapshotReaderFromEnv(env: NodeJS.ProcessEnv = process.env): GameSnapshotReader | null {
  const bucket = env.GAMES_SNAPSHOT_BUCKET?.trim();
  if (!bucket) return null;
  return createGcsSnapshotStore({ bucket });
}
