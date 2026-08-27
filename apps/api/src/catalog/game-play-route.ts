import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { GameProject } from '@gamedevpl/contract';
import {
  assembleGameHtml,
  CredentialLeakError,
  EmptyProjectError,
  ProjectTooLargeError,
} from '../platform/assemble.js';
import { SnapshotIncompleteError, SnapshotUnavailableError, type GameSnapshotReader } from './game-snapshot.js';
import { isRateLimited } from '../platform/ip-rate-limit.js';
import type { GitHubClient } from './github-client.js';
import type { CatalogRoutesHandle } from './catalog-routes.js';
import type { DraftPreviewRoutesHandle } from '../delivery/draft-preview-routes.js';
import type { Store } from '../platform/store.js';

export interface GamePlayRouteOptions {
  store?: Store;
  githubClient: GitHubClient | null;
  snapshotReader?: GameSnapshotReader | null;
  publishedRef: string;
  now: () => number;
  catalog: Pick<CatalogRoutesHandle, 'storePublishedGame' | 'isSlugPublished' | 'readSnapshotGame'>;
  draftPreview: Pick<DraftPreviewRoutesHandle, 'canPlayDraft' | 'replyWithDraft'>;
  maxGamesPerWindow?: number;
  gamesRateLimitWindowMs?: number;
}

export interface GamePlayRouteHandle {
  invalidateGameCache(slug: string): void;
}

// Serves a published game by slug, or the creator's own draft.
export async function registerGamePlayRoute(
  app: FastifyInstance,
  options: GamePlayRouteOptions,
): Promise<GamePlayRouteHandle> {
  const { store, githubClient, snapshotReader, publishedRef, now, catalog, draftPreview } = options;
  const maxGamesPerWindow = options.maxGamesPerWindow ?? 60;
  const gamesRateLimitWindowMs = options.gamesRateLimitWindowMs ?? 60 * 1000;

  const gameTtlMs = 5 * 60_000;
  const gameCache = new Map<string, { expiresAt: number; value: { slug: string; title: string; html: string } }>();
  const gamesByIp = new Map<string, number[]>();

  // Snapshot baked build preferred; falls back to assembling GitHub sources.

  // Same sandboxed, opaque-origin trust model as the preview endpoint.
  app.get('/api/games/:slug', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!githubClient) {
      return reply.status(503).send({ error: 'games are not configured' });
    }

    const slug = z.string().parse((request.params as { slug?: string }).slug);
    const currentTime = now();
    if (isRateLimited(gamesByIp, request.ip, currentTime, maxGamesPerWindow, gamesRateLimitWindowMs)) {
      return reply.status(429).send({ error: 'too many game requests, please try again later' });
    }

    const cached = gameCache.get(slug);
    if (cached && cached.expiresAt > currentTime) {
      return reply.send(cached.value);
    }

    try {
      // Store-published first: delivered games are never committed to the repo.
      const stored = await catalog.storePublishedGame(slug);
      if (stored) {
        gameCache.set(slug, { value: stored, expiresAt: currentTime + gameTtlMs });
        return reply.send(stored);
      }

      if (!(await catalog.isSlugPublished(slug))) {
        // One permalink for a game's whole life — draft or published.

        // Checked outside gameCache — a draft must never get cached under it.
        if (await draftPreview.canPlayDraft(request, slug)) {
          const record = await store?.getSubmissionBySlug(slug);
          if (record) return draftPreview.replyWithDraft(request, reply, record.jobId);
        }
        return reply.status(404).send({ error: 'game not found' });
      }

      if (snapshotReader) {
        // Baked at merge time by the same assembler as the GitHub path.
        const snapshotGame = await catalog.readSnapshotGame(slug);
        if (!snapshotGame) {
          throw new SnapshotIncompleteError(`published game "${slug}" is missing from the snapshot`);
        }
        gameCache.set(slug, { value: snapshotGame, expiresAt: currentTime + gameTtlMs });
        return reply.send(snapshotGame);
      }

      const sources = await githubClient.getGameSources(publishedRef, slug);
      if (!sources) {
        return reply.status(404).send({ error: 'game not found' });
      }

      const project: GameProject = {
        title: sources.title ?? slug,
        description: '',
        html: sources.indexHtml,
        js: sources.gameJs,
        css: sources.styleCss,
      };

      // restrictNetwork: published games are self-contained, like unreviewed previews.
      const html = assembleGameHtml(project, { restrictNetwork: true });
      const value = { slug, title: project.title, html };
      gameCache.set(slug, { value, expiresAt: currentTime + gameTtlMs });
      return reply.send(value);
    } catch (error) {
      if (error instanceof SnapshotUnavailableError) {
        request.log.error({ err: error, slug }, 'snapshot game unavailable');
        return reply.status(503).send({ error: 'game snapshot unavailable' });
      }
      if (error instanceof SnapshotIncompleteError) {
        request.log.error({ err: error, slug }, 'snapshot game incomplete');
        return reply.status(502).send({
          error: 'game snapshot incomplete',
          detail: error.message.replace(/\s+/g, ' ').trim().slice(0, 240),
        });
      }
      if (
        error instanceof EmptyProjectError ||
        error instanceof ProjectTooLargeError ||
        error instanceof CredentialLeakError
      ) {
        request.log.warn({ err: error, slug }, 'published game failed hygiene checks');
        return reply.status(422).send({ error: 'this game could not be served' });
      }
      request.log.error({ err: error, slug }, 'failed to serve game');
      // Short, non-sensitive detail — diagnosable without scraping Cloud Run logs.
      const detail = error instanceof Error ? error.message.replace(/\s+/g, ' ').trim().slice(0, 240) : 'unknown error';
      return reply.status(502).send({ error: 'failed to load game', detail });
    }
  });

  return {
    invalidateGameCache(slug: string): void {
      gameCache.delete(slug);
    },
  };
}
