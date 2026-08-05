import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GamesStore } from './games-store.js';
import type { Store } from './store.js';

/**
 * Public read-only sources — "Źródła".
 *
 * Every published creator game shows its code, to anyone, without a session. That is a
 * product decision the owner made deliberately (ops `docs/game-page-plan.md`): a game
 * built by an agent from a prompt is more interesting, not less, when you can read what
 * it actually is, and the creator checkout has always handed the same bytes to the
 * person who commissioned it.
 *
 * What that decision does **not** extend to:
 *
 *  - **Platform and repo-migrated games.** Their sources live in the private games repo,
 *    which is private for reasons this route does not get to revisit (resolved Q1/Q2 in
 *    the risk register). Only games delivered through the store — the ones with a
 *    creator behind them — are readable here.
 *  - **Unpublished work.** Only the version that is currently live. A candidate under
 *    review is unreviewed output and stays on the review route, owner-only.
 *  - **Anything not in the manifest.** Paths are matched against the version's own file
 *    list rather than being joined onto a prefix, so there is no traversal to defend
 *    against — a path that is not one of the delivered files simply does not exist.
 *
 * Content is served as JSON strings and never as a document: this route hands over text
 * for a client to render as text, and nothing here can be navigated to as HTML.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SlugParamsSchema = z.object({ slug: z.string().trim().min(1).max(64) });
const FileQuerySchema = z.object({ path: z.string().trim().min(1).max(200) });

/** Files past this are listed but not served inline — a viewer is not a download. */
export const MAX_VIEWABLE_FILE_BYTES = 512 * 1024;

export interface GameSourceFile {
  path: string;
  bytes: number;
  /** Coarse language tag for the viewer's highlighter — derived from the extension. */
  language: 'typescript' | 'json' | 'css' | 'html' | 'markdown' | 'text';
}

export interface GameSourcesResponse {
  version: string;
  files: GameSourceFile[];
  totalBytes: number;
}

export interface GameSourcesRoutesOptions {
  store: Store;
  gamesStore?: GamesStore | null;
  now?: () => number;
  cacheTtlMs?: number;
}

export function languageOf(path: string): GameSourceFile['language'] {
  if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

export async function registerGameSourcesRoutes(
  app: FastifyInstance,
  options: GameSourcesRoutesOptions,
): Promise<void> {
  const { store, gamesStore } = options;
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 300_000;

  // A listing costs one read per file to size it; versions are immutable, so the only
  // thing that invalidates this is a publish pointing the slug at a new one.
  const listings = new Map<string, { value: GameSourcesResponse; expiresAt: number }>();

  /** The live version of a store-published game, or null when there is nothing to show. */
  async function liveVersion(slug: string): Promise<string | null> {
    const publication = await store.getPublication(slug);
    if (!publication || publication.state !== 'published') return null;
    return publication.currentVersion;
  }

  app.get('/api/games/:slug/sources', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug)) {
      return reply.status(400).send({ error: 'invalid slug' });
    }
    const slug = params.data.slug;
    if (!gamesStore) return reply.status(404).send({ error: 'not_found' });

    try {
      const version = await liveVersion(slug);
      if (!version) return reply.status(404).send({ error: 'not_found' });

      const cacheKey = `${slug}@${version}`;
      const cached = listings.get(cacheKey);
      if (cached && cached.expiresAt > now()) return reply.send(cached.value);

      const manifest = await gamesStore.getManifest(slug, version);
      if (!manifest) return reply.status(404).send({ error: 'not_found' });

      const sized = await Promise.all(
        manifest.sourceFiles.map(async (path) => {
          const content = await gamesStore.getSourceFile(slug, version, path);
          return content === null
            ? null
            : ({
                path,
                bytes: Buffer.byteLength(content, 'utf8'),
                language: languageOf(path),
              } satisfies GameSourceFile);
        }),
      );
      // Case-insensitive, with a raw tie-break so the order is deterministic across
      // locales: a file list that reorders itself by who is reading it is a bad list.
      const files = sized
        .filter((file): file is GameSourceFile => file !== null)
        .sort((a, b) => {
          const left = a.path.toLowerCase();
          const right = b.path.toLowerCase();
          if (left !== right) return left < right ? -1 : 1;
          return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
        });

      const body: GameSourcesResponse = {
        version,
        files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      };
      if (listings.size >= 300) listings.clear();
      listings.set(cacheKey, { value: body, expiresAt: now() + cacheTtlMs });
      return reply.send(body);
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to list game sources');
      return reply.status(502).send({ error: 'failed to load sources' });
    }
  });

  app.get('/api/games/:slug/sources/file', async (request, reply) => {
    const params = SlugParamsSchema.safeParse(request.params);
    const query = FileQuerySchema.safeParse(request.query);
    if (!params.success || !SLUG_PATTERN.test(params.data.slug) || !query.success) {
      return reply.status(400).send({ error: 'invalid request' });
    }
    const slug = params.data.slug;
    if (!gamesStore) return reply.status(404).send({ error: 'not_found' });

    try {
      const version = await liveVersion(slug);
      if (!version) return reply.status(404).send({ error: 'not_found' });

      const manifest = await gamesStore.getManifest(slug, version);
      // Membership of the manifest is the whole authorization: the caller names one of
      // the delivered files or names nothing at all.
      if (!manifest?.sourceFiles.includes(query.data.path)) {
        return reply.status(404).send({ error: 'not_found' });
      }

      const content = await gamesStore.getSourceFile(slug, version, query.data.path);
      if (content === null) return reply.status(404).send({ error: 'not_found' });
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_VIEWABLE_FILE_BYTES) {
        return reply.status(413).send({ error: 'too_large', bytes, limit: MAX_VIEWABLE_FILE_BYTES });
      }

      return reply.send({
        path: query.data.path,
        version,
        bytes,
        language: languageOf(query.data.path),
        content,
      });
    } catch (error) {
      request.log.error({ err: error, slug }, 'failed to read a game source file');
      return reply.status(502).send({ error: 'failed to load source' });
    }
  });
}
