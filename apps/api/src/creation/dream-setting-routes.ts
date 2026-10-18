import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resolveGameAccess } from '../platform/game-access-resolve.js';
import type { Store } from '../platform/store.js';

const SlugParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
});

const DreamSettingSchema = z.object({ on: z.boolean() });
const DreamOfferAnswerSchema = z.object({ want: z.boolean() });

export interface DreamSettingRoutesOptions {
  store: Store;
  now?: () => number;
}

// Per game; the bell's account-wide mute still silences every game.
export async function registerDreamSettingRoutes(
  app: FastifyInstance,
  options: DreamSettingRoutesOptions,
): Promise<void> {
  const { store } = options;
  const now = options.now ?? Date.now;

  // Drafts count: a game is dreamed about long before it is published.
  async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    if (!request.user) {
      reply.status(401).send({ error: 'authentication required' });
      return null;
    }
    const params = SlugParamsSchema.safeParse(request.params);
    if (!params.success) {
      reply.status(400).send({ error: 'invalid slug' });
      return null;
    }
    const owner = (await resolveGameAccess(store, params.data.slug)).owner;
    if (owner.kind !== 'creator' || owner.uid !== request.user.uid) {
      // 404, not 403: confirming a stranger's slug says too much.
      reply.status(404).send({ error: 'not_found' });
      return null;
    }
    return params.data.slug;
  }

  async function describe(slug: string, uid: string) {
    const [offAt, wantedAt, user] = await Promise.all([
      store.getGameDreamsOffAt(slug),
      store.getGameDreamsWantedAt(slug),
      store.getUser(uid),
    ]);
    return { on: !offAt, wanted: Boolean(wantedAt), accountMuted: Boolean(user?.proposalsMutedAt) };
  }

  app.get('/api/me/games/:slug/dreams', async (request, reply) => {
    const slug = await requireOwner(request, reply);
    if (!slug) return reply;
    return reply.send(await describe(slug, request.user!.uid));
  });

  app.put('/api/me/games/:slug/dreams', async (request, reply) => {
    const slug = await requireOwner(request, reply);
    if (!slug) return reply;
    const body = DreamSettingSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });
    const at = new Date(now()).toISOString();
    await store.setGameDreamsOffAt(slug, body.data.on ? null : at);
    // Switching on is a yes, even after a declined offer.
    if (body.data.on && !(await store.getGameDreamsWantedAt(slug))) await store.setGameDreamsWantedAt(slug, at);
    return reply.send(await describe(slug, request.user!.uid));
  });

  // The thread's offer: yes asks the builder, no turns sketches off.
  app.post('/api/me/games/:slug/dreams/offer', async (request, reply) => {
    const slug = await requireOwner(request, reply);
    if (!slug) return reply;
    const body = DreamOfferAnswerSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'invalid request' });
    const at = new Date(now()).toISOString();
    if (body.data.want) {
      await store.setGameDreamsWantedAt(slug, at);
      await store.setGameDreamsOffAt(slug, null);
    } else {
      await store.setGameDreamsOffAt(slug, at);
    }
    return reply.send(await describe(slug, request.user!.uid));
  });
}
