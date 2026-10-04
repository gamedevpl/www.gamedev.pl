import { REMIX_MODES, type RemixMode } from '@gamedevpl/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isAdminSession } from '../platform/admin-session.js';
import type { Store } from '../platform/store.js';
import { resolveOwnerOfRecord } from './owner-of-record.js';

const SlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});

const RemixSettingSchema = z.object({ mode: z.enum(REMIX_MODES) });

export interface RemixSettingRoutesOptions {
  store: Store;
  adminUids?: Set<string>;
  // Drops caches that carry `remixOff` for this slug.
  onChanged?: (slug: string) => void;
  now?: () => number;
}

// Owner (or admin) toggles whether players may remix a game; default on.
export async function registerRemixSettingRoutes(
  app: FastifyInstance,
  options: RemixSettingRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  async function readMode(slug: string): Promise<RemixMode> {
    return (await store.getRemixSettings(slug))?.mode === 'off' ? 'off' : 'on';
  }

  async function writeMode(slug: string, mode: RemixMode, uid: string): Promise<void> {
    await store.putRemixSettings({ slug, mode, updatedAt: new Date(now()).toISOString(), updatedByUid: uid });
    options.onChanged?.(slug);
  }

  // Same owner-of-record rule as the contributions switch.
  async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    if (!request.user) {
      reply.status(401).send({ error: 'authentication required' });
      return null;
    }
    if (request.user.tier === 'blocked') {
      reply.status(403).send({ error: 'account is blocked' });
      return null;
    }
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ error: 'invalid slug' });
      return null;
    }
    const owner = await resolveOwnerOfRecord(store, params.data.slug);
    if (owner.kind !== 'creator' || owner.uid !== request.user.uid) {
      reply.status(404).send({ error: 'not_found' });
      return null;
    }
    return params.data.slug;
  }

  app.get('/api/me/games/:slug/remix', async (request, reply) => {
    const slug = await requireOwner(request, reply);
    if (!slug) return reply;
    return reply.send({ mode: await readMode(slug) });
  });

  app.put('/api/me/games/:slug/remix', async (request, reply) => {
    const slug = await requireOwner(request, reply);
    if (!slug) return reply;
    const body = RemixSettingSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });
    await writeMode(slug, body.data.mode, request.user!.uid);
    return reply.send({ mode: body.data.mode });
  });

  // Admins hold the switch for platform games, or any game.
  app.get('/api/admin/games/:slug/remix', async (request, reply) => {
    if (!isAdminSession(request, options.adminUids)) return reply.status(404).send({ error: 'not_found' });
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
    return reply.send({ mode: await readMode(params.data.slug) });
  });

  app.put('/api/admin/games/:slug/remix', async (request, reply) => {
    if (!isAdminSession(request, options.adminUids)) return reply.status(404).send({ error: 'not_found' });
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'invalid slug' });
    const body = RemixSettingSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });
    await writeMode(params.data.slug, body.data.mode, request.user?.uid ?? 'admin');
    return reply.send({ mode: body.data.mode });
  });
}
