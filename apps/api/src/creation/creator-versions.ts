import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GamesStore } from '../delivery/games-store.js';
import type { Store } from '../platform/store.js';

const SlugParams = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
});

const VersionParams = SlugParams.extend({
  version: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
});

export interface CreatorVersionRoutesOptions {
  store: Store;
  gamesStore?: GamesStore;
}

async function requireOwner(store: Store, uid: string | undefined, slug: string): Promise<'auth' | 'missing' | 'ok'> {
  if (!uid) return 'auth';
  const records = await store.listSubmissionsByOwner(uid);
  return records.some((record) => record.slug === slug) ? 'ok' : 'missing';
}

export async function registerCreatorVersionRoutes(
  app: FastifyInstance,
  options: CreatorVersionRoutesOptions,
): Promise<void> {
  const { store, gamesStore } = options;

  app.get<{ Params: { slug: string } }>('/api/me/studio/games/:slug/versions', async (request, reply) => {
    if (!request.user) return reply.status(401).send({ error: 'authentication required' });
    const parsed = SlugParams.safeParse(request.params);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid slug' });
    if (!gamesStore?.listVersions) return reply.status(503).send({ error: 'games store is not configured' });
    const owned = await requireOwner(store, request.user.uid, parsed.data.slug);
    if (owned !== 'ok') return reply.status(404).send({ error: 'no such game' });
    const versions = await gamesStore.listVersions(parsed.data.slug, { limit: 100 });
    return reply.send({
      slug: parsed.data.slug,
      versions: versions.map((row) => ({
        version: row.version,
        createdAt: row.createdAt,
        jobId: row.jobId,
        sourceFiles: row.sourceFiles,
        ...(row.deliveryMode ? { deliveryMode: row.deliveryMode } : {}),
      })),
    });
  });

  app.get<{ Params: { slug: string; version: string } }>(
    '/api/me/studio/games/:slug/versions/:version/tree',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!request.user) return reply.status(401).send({ error: 'authentication required' });
      const parsed = VersionParams.safeParse(request.params);
      if (!parsed.success) return reply.status(400).send({ error: 'invalid slug or version' });
      if (!gamesStore) return reply.status(503).send({ error: 'games store is not configured' });
      const owned = await requireOwner(store, request.user.uid, parsed.data.slug);
      if (owned !== 'ok') return reply.status(404).send({ error: 'no such game' });
      const manifest = await gamesStore.getManifest(parsed.data.slug, parsed.data.version);
      if (!manifest) return reply.status(404).send({ error: 'no such version' });
      const files = await Promise.all(
        manifest.sourceFiles.map(async (path) => ({
          path,
          content: await gamesStore.getSourceFile(parsed.data.slug, parsed.data.version, path),
        })),
      );
      const missing = files.filter((file) => file.content === null).map((file) => file.path);
      if (missing.length > 0) {
        request.log.error(
          { slug: parsed.data.slug, version: parsed.data.version, missing },
          'version tree missing files',
        );
        return reply.status(502).send({ error: 'the delivered version could not be read back' });
      }
      return reply.send({
        slug: parsed.data.slug,
        version: parsed.data.version,
        files: files as Array<{ path: string; content: string }>,
      });
    },
  );
}
