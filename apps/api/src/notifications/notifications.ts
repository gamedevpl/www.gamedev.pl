// Notification read API (docs/notifications-plan.md N3). Session-gated: the bell
// fetches on boot and on a slow poll, and marks items read. In private-beta mode
// the wall in app.ts already enforces a session on /api/*, but these handlers also
// check request.user directly so they stay correct once the site is public.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Store } from '../platform/store.js';

const MarkReadSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((body) => body.all === true || (body.ids?.length ?? 0) > 0, {
    message: 'provide ids or all: true',
  });

const PreferencesSchema = z.object({
  /** Weekly creator digest. Absent means "leave it as it is". */
  digest: z.boolean().optional(),
  /** Notification email in general. Turning this on undoes a one-click unsubscribe. */
  email: z.boolean().optional(),
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

  // Delete notifications — a single one (`{ ids: [id] }`, the per-item dismiss) or
  // the whole list (`{ all: true }`, the header "Clear all").
  app.post('/api/notifications/clear', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const parsed = MarkReadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    await store.deleteNotifications(request.user.uid, parsed.data.all ? 'all' : parsed.data.ids!);
    return reply.send({ ok: true });
  });

  /**
   * What this account has chosen to receive.
   *
   * Both switches were previously reachable only from a link inside an email, which left
   * two people stuck: someone who reads the digest in the bell had no way to stop it, and
   * anyone who unsubscribed had no way back — `setEmailUnsubscribed` has always accepted
   * `null`, but nothing ever passed it. An opt-out with no matching opt-in is a decision
   * a person cannot revise.
   */
  app.get('/api/me/notification-preferences', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const user = await store.getUser(request.user.uid);
    return reply.send({
      // Reported as "is it on", not as the timestamps behind it: a client should not have
      // to know that off is stored as a date and on as null.
      digest: !user?.digestOptOutAt,
      email: !user?.emailUnsubscribedAt,
    });
  });

  app.put('/api/me/notification-preferences', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const parsed = PreferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }

    const uid = request.user.uid;
    const now = new Date().toISOString();
    // Only the keys actually sent are touched, so a client that knows about one switch
    // cannot silently reset another it has never heard of.
    if (parsed.data.digest !== undefined) {
      await store.setDigestOptOut(uid, parsed.data.digest ? null : now);
    }
    if (parsed.data.email !== undefined) {
      await store.setEmailUnsubscribed(uid, parsed.data.email ? null : now);
    }

    const user = await store.getUser(uid);
    return reply.send({ digest: !user?.digestOptOutAt, email: !user?.emailUnsubscribedAt });
  });
}
