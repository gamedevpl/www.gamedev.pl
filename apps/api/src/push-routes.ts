// Web Push subscription API (docs/notifications-plan.md M2). Session-gated: only a
// signed-in user can register a browser to receive push, and each subscription is
// stored under that user's id so the notification fan-out can reach every device
// they opted in on. In private-beta mode the wall in app.ts already enforces a
// session on /api/*, but these handlers also check request.user directly so they
// stay correct once the site is public.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPusherFromEnv } from './pusher.js';
import type { Store } from './store.js';

// The client sends `subscription.toJSON()` verbatim. Validate the shape we depend
// on (endpoint + the two ECDH keys) and ignore any extra fields the browser adds.
const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url().max(2048),
    keys: z.object({
      p256dh: z.string().min(1).max(256),
      auth: z.string().min(1).max(256),
    }),
  }),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export interface PushRoutesOptions {
  store: Store;
  /** The VAPID public key the client needs to subscribe; undefined ⇒ push is off. */
  vapidPublicKey?: string;
}

export async function registerPushRoutes(app: FastifyInstance, options: PushRoutesOptions): Promise<void> {
  const { store, vapidPublicKey } = options;

  // The client fetches this before subscribing: it needs the server's VAPID public
  // key as the `applicationServerKey`, and `enabled` tells the UI whether to show
  // the opt-in at all (hidden when the server has no keys configured).
  app.get('/api/push/config', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    return reply.send({ enabled: Boolean(vapidPublicKey), vapidPublicKey: vapidPublicKey ?? null });
  });

  app.post('/api/push/subscribe', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const parsed = SubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid subscription' });
    }
    await store.savePushSubscription(request.user.uid, parsed.data.subscription);
    return reply.send({ ok: true });
  });

  app.post('/api/push/unsubscribe', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const parsed = UnsubscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
    }
    await store.deletePushSubscription(request.user.uid, parsed.data.endpoint);
    return reply.send({ ok: true });
  });

  // Send a test push to the caller's OWN devices. Lets a user confirm the whole
  // chain (server → push service → service worker → OS notification) right after
  // opting in, and doubles as a self-serve health check. Sends only to the
  // caller's subscriptions, and prunes any the push service reports gone.
  app.post('/api/push/test', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'authentication required' });
    }
    const pusher = createPusherFromEnv();
    if (!pusher) {
      return reply.status(503).send({ error: 'push not configured' });
    }
    const subscriptions = await store.listPushSubscriptions(request.user.uid);
    const appBaseUrl = process.env.APP_BASE_URL?.trim() || 'https://www.gamedev.pl';
    const payload = {
      title: 'gamedev.pl',
      body: 'Push notifications are working 🎉',
      url: `${appBaseUrl}/`,
      tag: 'push-test',
    };

    let sent = 0;
    let pruned = 0;
    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await pusher.send({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        if (result.outcome === 'sent') sent += 1;
        else if (result.outcome === 'gone') {
          await store.deletePushSubscription(request.user!.uid, sub.endpoint).catch(() => {});
          pruned += 1;
        }
      }),
    );
    return reply.send({ ok: true, subscriptions: subscriptions.length, sent, pruned });
  });
}
