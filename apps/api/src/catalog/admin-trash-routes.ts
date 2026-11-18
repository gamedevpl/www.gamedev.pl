import type { FastifyInstance } from 'fastify';
import { purgeTrashedGame } from '../platform/game-trash-reaper.js';
import { isAdminSession } from '../platform/admin-session.js';
import type { AdminGameRoutesOptions } from './admin-game-routes.js';

export function registerAdminTrashRoutes(app: FastifyInstance, options: AdminGameRoutesOptions) {
  const { store, adminUids, gamesStore, invalidatePublishedGameCaches } = options;
  app.get('/api/admin/game-trash', async (request, reply) => {
    if (!isAdminSession(request, adminUids)) return reply.code(404).send({ error: 'not_found' });
    if (!store) return reply.code(503).send({ error: 'store_unavailable' });
    return { games: (await store.gameTrash.list()).map(({ slug, purgeAfter }) => ({ slug, purgeAfter })) };
  });
  app.post<{ Params: { slug: string }; Body: { confirmation?: string } }>(
    '/api/admin/games/:slug/purge',
    async (request, reply) => {
      if (!isAdminSession(request, adminUids)) return reply.code(404).send({ error: 'not_found' });
      if (!store) return reply.code(503).send({ error: 'store_unavailable' });
      const { slug } = request.params;
      if (request.body?.confirmation !== slug) return reply.code(400).send({ error: 'slug_confirmation_required' });
      await purgeTrashedGame(store, gamesStore, slug, options.repoPublished);
      invalidatePublishedGameCaches(slug);
      return { ok: true };
    },
  );
}
