// Notification read API (docs/notifications-plan.md N3). Session-gated: the bell
// fetches on boot and on a slow poll, and marks items read. In private-beta mode
// the wall in app.ts already enforces a session on /api/*, but these handlers also
// check request.user directly so they stay correct once the site is public.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from './store.js';

const MarkReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((body) => body.all === true || (body.ids?.length ?? 0) > 0, {
    message: 'provide ids or all: true',
  });

export interface NotificationRoutesOptions {
  store: Store;
}

export async function registerNotificationRoutes(
  app: FastifyInstance,
  options: NotificationRoutesOptions,
): Promise<void> {
  const { store } = options;

  app.get('/api/notifications', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const notifications = await store.listNotifications(request.user.uid, { limit: 20 });
    return reply.send({ notifications });
  });

  app.post('/api/notifications/read', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const parsed = MarkReadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    await store.markNotificationsRead(request.user.uid, parsed.data.all ? 'all' : parsed.data.ids!);
    return reply.send({ ok: true });
  });
}
