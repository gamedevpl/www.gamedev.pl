import type { FastifyInstance } from 'fastify';
import { parseSpecTitle } from './github-client.js';
import { startHealthCheck, type HealthGateTrigger } from './game-health.js';
import { runSlugBackfill, type SlugClaimProbe } from './slug-backfill.js';
import type { GamesStore } from '../delivery/games-store.js';
import { isAdminSession } from '../platform/admin-session.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { Store } from '../platform/store.js';
import { isPublished } from '../platform/publication-state.js';

export interface AdminGameRoutesOptions {
  store?: Store;
  adminUids?: Set<string>;
  now: () => number;
  gamesStore?: GamesStore;
  onSourcesDelivered?: HealthGateTrigger;
  invalidatePublishedGameCaches: (slug: string) => void;
  isSlugClaimed: SlugClaimProbe;
  confirmSlugClaim: (jobId: number, slug: string, title: string) => Promise<string | null>;
}

// Operator's published-games shelf: list, re-gate, delete, backfills.
export async function registerAdminGameRoutes(app: FastifyInstance, options: AdminGameRoutesOptions): Promise<void> {
  const {
    store,
    adminUids,
    now,
    gamesStore,
    onSourcesDelivered,
    invalidatePublishedGameCaches,
    isSlugClaimed,
    confirmSlugClaim,
  } = options;

  // Slugs only — titles would cost a manifest read per game.
  app.get('/api/admin/games', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    const publications = await store.listPublications();
    return reply.send({
      games: publications.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    });
  });

  // Manual trigger of the break-and-nudge loop, against the *current* engine.
  app.post<{ Params: { slug: string } }>('/api/admin/games/:slug/regate', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    const gateTrigger = onSourcesDelivered;
    if (!gamesStore || !gateTrigger) return reply.status(503).send({ error: 'gate_unavailable' });

    const slug = request.params.slug;
    const publication = await store.getPublication(slug);
    if (!publication) return reply.status(404).send({ error: 'not_found' });
    if (!isPublished(publication)) {
      return reply.status(409).send({ error: 'not_published', state: publication.state });
    }

    // Same starter the scheduled sweep uses, minus its recheck cooldown.
    const start = await startHealthCheck({ store, gamesStore, gateTrigger, now }, publication);
    if (!start.started) return reply.status(409).send({ error: start.reason });

    return reply.send({ ok: true, slug, version: start.version, ...(start.buildId ? { buildId: start.buildId } : {}) });
  });

  app.post<{ Params: { slug: string }; Body: { reason?: string } }>(
    '/api/admin/games/:slug/delete',
    async (request, reply) => {
      if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
      if (!store) return reply.status(503).send({ error: 'store_unavailable' });

      const slug = request.params.slug;
      const publication = await store.getPublication(slug);
      if (!publication) return reply.status(404).send({ error: 'not_found' });
      if (!isPublished(publication)) {
        return reply.status(409).send({ error: 'not_published', state: publication.state });
      }

      const reason =
        typeof request.body?.reason === 'string' && request.body.reason.trim()
          ? request.body.reason.trim()
          : 'deleted by operator';
      await store.archivePublication(slug, reason, new Date(now()).toISOString());
      invalidatePublishedGameCaches(slug);

      return reply.send({ ok: true, slug });
    },
  );

  // Addresses games still missing one — loop lives in slug-backfill.ts.
  app.post<{ Querystring: { dryRun?: string } }>('/api/admin/slug-backfill', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });

    const dryRun = request.query.dryRun === '1' || request.query.dryRun === 'true';
    const result = await runSlugBackfill({ store, isSlugClaimed, dryRun, confirmSlugClaim });
    const { named } = result;
    request.log.info({ dryRun, scanned: result.scanned, named, failed: result.failed }, 'slug backfill complete');
    return reply.send(result);
  });

  // Gives the delivered SPEC title to games still showing the truncated prompt.
  app.post<{ Querystring: { dryRun?: string } }>('/api/admin/title-backfill', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.status(404).send({ error: 'not_found' });
    if (!store) return reply.status(503).send({ error: 'store_unavailable' });
    if (!gamesStore) return reply.status(503).send({ error: 'games_store_unavailable' });

    const dryRun = request.query.dryRun === '1' || request.query.dryRun === 'true';
    const pending = await store.listSubmissionsWithDelivery();
    const games: Array<{
      jobId: number;
      slug: string;
      from: string;
      to: string | null;
      changed: boolean;
    }> = [];

    for (const record of pending) {
      const slug = record.slug!;
      const version = record.deliveredVersion!;
      const spec = await gamesStore.getSourceFile(slug, version, 'SPEC.md');
      const parsed = spec ? parseSpecTitle(spec) : null;
      const next = parsed ? sanitizeCreatorText(parsed, { singleLine: true }).slice(0, 80) : null;
      const usable = next && next.length >= 3 ? next : null;
      const changed = Boolean(usable && usable !== record.title);

      if (!dryRun && changed && usable) {
        await store.setSubmissionTitle(record.jobId, usable);
      }

      games.push({
        jobId: record.jobId,
        slug,
        from: record.title,
        to: usable,
        changed,
      });
    }

    const renamed = games.filter((game) => game.changed).length;
    const result = {
      ok: true,
      dryRun,
      scanned: pending.length,
      renamed,
      unchanged: pending.length - renamed,
      games,
    };
    request.log.info(
      { dryRun, scanned: result.scanned, renamed, unchanged: result.unchanged },
      'title backfill complete',
    );
    return reply.send(result);
  });
}
